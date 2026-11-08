import Peer, { type DataConnection } from "peerjs";
import type { BuddyBodySave } from "./engine";

export interface RoomPlayer { id: string; name: string; owner: boolean; color: string }
export interface RoomState { code: string; mapId: string; maxPlayers: number; ownerId: string; players: RoomPlayer[] }
export interface RoomCallbacks {
  onState: (state: RoomState | null) => void;
  onSnapshots: (snapshots: Record<string, BuddyBodySave[]>) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
}
type Packet =
  | { type: "hello"; name: string; color: string }
  | { type: "welcome"; state: RoomState }
  | { type: "state"; state: RoomState }
  | { type: "snapshot"; playerId: string; bodies: BuddyBodySave[] }
  | { type: "snapshots"; snapshots: Record<string, BuddyBodySave[]> }
  | { type: "leave"; playerId: string }
  | { type: "kick"; playerId: string }
  | { type: "map"; mapId: string }
  | { type: "handoff"; nextOwner: string; state: RoomState }
  | { type: "reject"; reason: string };

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const peerIdFor = (code: string) => `whatbash${code.toLowerCase()}`;
const makeCode = () => Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");

export class PeerRoom {
  private peer: Peer | null = null;
  private hostConnection: DataConnection | null = null;
  private connections = new Map<string, DataConnection>();
  private players: RoomPlayer[] = [];
  private snapshots: Record<string, BuddyBodySave[]> = {};
  private room: RoomState | null = null;
  private localId = "";
  private isOwner = false;
  private closed = false;
  private callbacks: RoomCallbacks;
  private name: string;
  private color: string;
  private promotionTimer: number | null = null;

  constructor(callbacks: RoomCallbacks, name: string, color: string) {
    this.callbacks = callbacks;
    this.name = name;
    this.color = color;
  }

  get state() { return this.room; }
  get playerId() { return this.localId; }
  get owner() { return this.isOwner; }

  async create(mapId: string, maxPlayers: number) {
    this.closed = false;
    const code = makeCode();
    this.room = { code, mapId, maxPlayers, ownerId: "host", players: [] };
    this.isOwner = true;
    this.callbacks.onStatus("Opening room...");
    await this.openHostPeer(code);
    this.localId = this.peer!.id;
    this.players = [{ id: this.localId, name: this.name, owner: true, color: this.color }];
    this.room.ownerId = this.localId;
    this.room.players = [...this.players];
    this.callbacks.onState(this.room);
    this.callbacks.onStatus("Room ready");
    return this.room;
  }

  private openHostPeer(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerIdFor(code), { debug: 1 });
      this.peer = peer;
      let settled = false;
      peer.on("open", () => {
        settled = true;
        resolve();
      });
      peer.on("connection", (connection) => this.acceptConnection(connection));
      peer.on("error", (error) => {
        if (!settled) reject(error);
        else if (error.type === "disconnected") this.callbacks.onStatus("Signaling connection interrupted");
        else this.callbacks.onError(error.message || "Room connection error");
      });
      peer.on("disconnected", () => {
        if (!this.closed && this.isOwner) void peer.reconnect();
      });
    });
  }

  async join(codeInput: string) {
    const code = codeInput.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("Enter a valid 6-character room code.");
    this.closed = false;
    this.room = { code, mapId: "park", maxPlayers: 8, ownerId: "", players: [] };
    this.callbacks.onStatus("Finding room...");
    const peer = new Peer(undefined, { debug: 1 });
    this.peer = peer;
    await new Promise<void>((resolve, reject) => {
      peer.on("open", (id) => { this.localId = id; resolve(); });
      peer.on("error", (error) => reject(new Error(error.message || "Could not connect to signaling service.")));
    });
    await this.connectToHost(code);
    return this.room!;
  }

  private connectToHost(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = this.peer;
      if (!peer) return reject(new Error("Peer connection is not ready."));
      const connection = peer.connect(peerIdFor(code), { reliable: true, serialization: "json" });
      this.hostConnection = connection;
      let gotWelcome = false;
      connection.on("open", () => connection.send({ type: "hello", name: this.name, color: this.color } satisfies Packet));
      connection.on("data", (raw) => {
        const packet = raw as Packet;
        if (packet.type === "reject") {
          reject(new Error(packet.reason));
          return;
        }
        if (packet.type === "welcome" || packet.type === "state") {
          this.applyState(packet.state);
          if (!gotWelcome) { gotWelcome = true; resolve(); }
        } else this.handleHostPacket(packet);
      });
      connection.on("close", () => {
        if (this.closed) return;
        this.callbacks.onStatus("Host disconnected — reconnecting room...");
        this.tryRecoverHost(code);
      });
      connection.on("error", (error) => {
        if (!gotWelcome) reject(new Error(error.message || "Room not found. Check the code."));
      });
      window.setTimeout(() => { if (!gotWelcome) reject(new Error("Room not found. Check the code and try again.")); }, 12000);
    });
  }

  private acceptConnection(connection: DataConnection) {
    connection.on("data", (raw) => {
      const packet = raw as Packet;
      if (packet.type === "hello") {
        if (!this.room || this.players.length >= this.room.maxPlayers) {
          connection.send({ type: "reject", reason: "This room is full." } satisfies Packet);
          connection.close();
          return;
        }
        const player: RoomPlayer = { id: connection.peer, name: String(packet.name || "Player").slice(0, 18), color: /^#[0-9a-f]{6}$/i.test(packet.color) ? packet.color : "#2fd3cb", owner: false };
        this.connections.set(player.id, connection);
        this.players.push(player);
        this.broadcastState(connection);
        connection.send({ type: "welcome", state: this.room! } satisfies Packet);
        connection.send({ type: "snapshots", snapshots: this.snapshots } satisfies Packet);
        this.callbacks.onState(this.room);
      } else if (packet.type === "snapshot") {
        if (!this.players.some((player) => player.id === packet.playerId)) return;
        this.snapshots[packet.playerId] = packet.bodies;
        this.broadcast({ type: "snapshots", snapshots: this.snapshots });
        this.callbacks.onSnapshots(this.snapshots);
      } else if (packet.type === "leave") {
        this.removePlayer(packet.playerId);
      } else if (packet.type === "map" && this.isOwner && this.room) {
        this.room.mapId = packet.mapId;
        this.broadcastState();
      }
    });
    connection.on("close", () => {
      if (this.isOwner) this.removePlayer(connection.peer);
    });
  }

  private handleHostPacket(packet: Packet) {
    if (packet.type === "state") this.applyState(packet.state);
    else if (packet.type === "snapshots") {
      this.snapshots = packet.snapshots;
      this.callbacks.onSnapshots(this.snapshots);
    } else if (packet.type === "handoff") {
      this.applyState(packet.state);
      this.beginHandoff(packet.nextOwner, packet.state.code);
    } else if (packet.type === "kick" && packet.playerId === this.localId) {
      this.callbacks.onStatus("You were removed from the room.");
      void this.leave(false);
      this.callbacks.onState(null);
    }
  }

  private applyState(state: RoomState) {
    this.room = state;
    this.players = state.players;
    this.isOwner = state.ownerId === this.localId;
    this.callbacks.onState(state);
  }

  private broadcast(packet: Packet) {
    for (const connection of this.connections.values()) if (connection.open) connection.send(packet);
  }

  private broadcastState(except?: DataConnection) {
    if (!this.room) return;
    this.room.players = [...this.players];
    this.room.players.forEach((player) => player.owner = player.id === this.room!.ownerId);
    const packet: Packet = { type: "state", state: this.room };
    for (const connection of this.connections.values()) if (connection !== except && connection.open) connection.send(packet);
  }

  private removePlayer(id: string) {
    this.connections.delete(id);
    this.players = this.players.filter((player) => player.id !== id);
    delete this.snapshots[id];
    if (!this.room) return;
    this.broadcastState();
    this.callbacks.onState(this.room);
    this.callbacks.onSnapshots(this.snapshots);
    if (!this.players.length) void this.leave(false);
  }

  sendSnapshot(bodies: BuddyBodySave[]) {
    if (this.closed || !this.room) return;
    if (this.isOwner) {
      this.snapshots[this.localId] = bodies;
      this.broadcast({ type: "snapshots", snapshots: this.snapshots });
      this.callbacks.onSnapshots(this.snapshots);
    } else if (this.hostConnection?.open) {
      this.hostConnection.send({ type: "snapshot", playerId: this.localId, bodies } satisfies Packet);
    }
  }

  setMap(mapId: string) {
    if (!this.room || !this.isOwner) return;
    this.room.mapId = mapId;
    this.broadcastState();
    this.callbacks.onState(this.room);
  }

  kick(playerId: string) {
    if (!this.isOwner || !this.room || playerId === this.localId) return;
    this.connections.get(playerId)?.send({ type: "kick", playerId } satisfies Packet);
    this.connections.get(playerId)?.close();
    this.removePlayer(playerId);
  }

  private beginHandoff(nextOwner: string, code: string) {
    const promote = nextOwner === this.localId;
    this.isOwner = promote;
    this.promotionTimer = window.setTimeout(() => {
      if (this.closed) return;
      if (promote) {
        this.isOwner = true;
        void this.openHostPeer(code).then(() => {
          this.localId = this.peer!.id;
          if (this.room) {
            this.room.ownerId = this.localId;
            this.players = this.players.filter((player) => player.id !== nextOwner);
            this.players.unshift({ id: this.localId, name: this.name, color: this.color, owner: true });
            this.room.players = [...this.players];
            this.broadcastState();
            this.callbacks.onState(this.room);
          }
        }).catch(() => this.callbacks.onError("Room ownership transfer failed. The room may have closed."));
      } else {
        const peer = new Peer(undefined, { debug: 1 });
        this.peer = peer;
        peer.on("open", (id) => {
          this.localId = id;
          void this.connectToHost(code).catch(() => this.tryRecoverHost(code));
        });
      }
    }, 1800);
    this.hostConnection?.close();
    this.hostConnection = null;
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
  }

  private tryRecoverHost(code: string) {
    if (this.closed || this.isOwner || !this.room) return;
    if (this.promotionTimer !== null) return;
    const next = this.players.find((player) => player.id !== this.room?.ownerId);
    if (!next) {
      this.callbacks.onState(null);
      return;
    }
    this.promotionTimer = window.setTimeout(() => {
      this.promotionTimer = null;
      if (next.id === this.localId) {
        this.isOwner = true;
        const peer = new Peer(peerIdFor(code), { debug: 1 });
        this.peer = peer;
        peer.on("open", (id) => {
          this.localId = id;
          if (this.room) {
            this.room.ownerId = id;
            this.players = this.players.filter((player) => player.id !== next.id);
            this.players.unshift({ id, name: this.name, color: this.color, owner: true });
            this.broadcastState();
            this.callbacks.onState(this.room);
          }
          this.callbacks.onStatus("Room ownership transferred to you");
        });
        peer.on("connection", (connection) => this.acceptConnection(connection));
      } else {
        void this.connectToHost(code).catch(() => this.tryRecoverHost(code));
      }
    }, 1800);
  }

  async leave(notify = true) {
    if (this.closed) return;
    this.closed = true;
    if (this.promotionTimer !== null) window.clearTimeout(this.promotionTimer);
    if (notify && this.isOwner && this.room) {
      const next = this.players.find((player) => player.id !== this.localId);
      if (next) {
        const state = { ...this.room, ownerId: next.id, players: this.players.map((player) => ({ ...player, owner: player.id === next.id })) };
        this.broadcast({ type: "handoff", nextOwner: next.id, state });
      }
    } else if (notify && this.hostConnection?.open) {
      this.hostConnection.send({ type: "leave", playerId: this.localId });
    }
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
    this.hostConnection?.close();
    this.hostConnection = null;
    this.peer?.destroy();
    this.peer = null;
    this.players = [];
    this.snapshots = {};
    this.room = null;
    this.isOwner = false;
    this.callbacks.onSnapshots({});
    this.callbacks.onState(null);
    this.callbacks.onStatus("Left room");
  }
}
