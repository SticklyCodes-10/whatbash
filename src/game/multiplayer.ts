import Peer, { type DataConnection } from "peerjs";
import type { BuddyBodySave } from "./engine";
import { BODY_KEYS } from "./ragdoll";

export interface RoomPlayer { id: string; name: string; owner: boolean; color: string }
export interface RoomState { code: string; mapId: string; maxPlayers: number; ownerId: string; players: RoomPlayer[] }
export interface RoomCallbacks {
  onState: (state: RoomState | null) => void;
  onSnapshots: (snapshots: Record<string, BuddyBodySave[]>) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
}
type Packet =
  | { type: "hello"; playerId: string; name: string; color: string }
  | { type: "welcome"; state: RoomState }
  | { type: "state"; state: RoomState }
  | { type: "snapshot"; playerId: string; bodies: BuddyBodySave[] }
  | { type: "snapshots"; snapshots: Record<string, BuddyBodySave[]> }
  | { type: "pose"; playerId: string; seq: number; full: boolean; values: number[] }
  | { type: "leave"; playerId: string }
  | { type: "kick"; playerId: string }
  | { type: "map"; mapId: string }
  | { type: "handoff"; nextOwner: string; state: RoomState }
  | { type: "reject"; reason: string };

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const peerIdFor = (code: string) => `whatbash${code.toLowerCase()}`;
const makeCode = () => Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
const VALUES_PER_BODY = 13;
const POSITION_SCALE = 100;
const QUATERNION_SCALE = 32767;
const VELOCITY_SCALE = 50;
const ANGULAR_SCALE = 100;
const clampInt16 = (value: number) => Math.max(-32767, Math.min(32767, Math.round(value)));
const quantize = (bodies: BuddyBodySave[]) => {
  const values: number[] = [];
  for (const body of bodies) {
    values.push(
      clampInt16(body.position[0] * POSITION_SCALE), clampInt16(body.position[1] * POSITION_SCALE), clampInt16(body.position[2] * POSITION_SCALE),
      clampInt16(body.quaternion[0] * QUATERNION_SCALE), clampInt16(body.quaternion[1] * QUATERNION_SCALE), clampInt16(body.quaternion[2] * QUATERNION_SCALE), clampInt16(body.quaternion[3] * QUATERNION_SCALE),
      clampInt16(body.velocity[0] * VELOCITY_SCALE), clampInt16(body.velocity[1] * VELOCITY_SCALE), clampInt16(body.velocity[2] * VELOCITY_SCALE),
      clampInt16(body.angularVelocity[0] * ANGULAR_SCALE), clampInt16(body.angularVelocity[1] * ANGULAR_SCALE), clampInt16(body.angularVelocity[2] * ANGULAR_SCALE),
    );
  }
  return values;
};
const encodePose = (seq: number, full: boolean, values: number[]): ArrayBuffer => {
  const count = full ? values.length : values.length / 2;
  const bytes = 8 + count * (full ? 2 : 4);
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  view.setUint8(0, 1); // protocol version
  view.setUint8(1, full ? 1 : 0);
  view.setUint32(2, seq >>> 0, true);
  view.setUint16(6, count, true);
  let offset = 8;
  if (full) {
    for (const value of values) { view.setInt16(offset, value, true); offset += 2; }
  } else {
    for (let i = 0; i + 1 < values.length; i += 2) {
      view.setUint16(offset, values[i], true);
      view.setInt16(offset + 2, values[i + 1], true);
      offset += 4;
    }
  }
  return buffer;
};
const decodePose = (data: ArrayBuffer | Uint8Array): Extract<Packet, { type: "pose" }> | null => {
  const buffer = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  if (buffer.byteLength < 8) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== 1) return null;
  const full = (view.getUint8(1) & 1) !== 0;
  const seq = view.getUint32(2, true);
  const count = view.getUint16(6, true);
  const expected = 8 + count * (full ? 2 : 4);
  if (buffer.byteLength !== expected || count > BODY_KEYS.length * VALUES_PER_BODY) return null;
  const values: number[] = [];
  let offset = 8;
  if (full) {
    for (let i = 0; i < count; i++, offset += 2) values.push(view.getInt16(offset, true));
  } else {
    for (let i = 0; i < count; i++, offset += 4) values.push(view.getUint16(offset, true), view.getInt16(offset + 2, true));
  }
  return { type: "pose", playerId: "", seq, full, values };
};
const expandPose = (values: number[]): BuddyBodySave[] => {
  const bodies: BuddyBodySave[] = [];
  for (let offset = 0; offset + VALUES_PER_BODY <= values.length; offset += VALUES_PER_BODY) {
    const v = values.slice(offset, offset + VALUES_PER_BODY);
    const key = BODY_KEYS[offset / VALUES_PER_BODY];
    if (!key) break;
    bodies.push({
      key,
      position: [v[0] / POSITION_SCALE, v[1] / POSITION_SCALE, v[2] / POSITION_SCALE],
      quaternion: [v[3] / QUATERNION_SCALE, v[4] / QUATERNION_SCALE, v[5] / QUATERNION_SCALE, v[6] / QUATERNION_SCALE],
      velocity: [v[7] / VELOCITY_SCALE, v[8] / VELOCITY_SCALE, v[9] / VELOCITY_SCALE],
      angularVelocity: [v[10] / ANGULAR_SCALE, v[11] / ANGULAR_SCALE, v[12] / ANGULAR_SCALE],
    });
  }
  return bodies;
};

export class PeerRoom {
  private peer: Peer | null = null;
  private hostConnection: DataConnection | null = null;
  private connections = new Map<string, DataConnection>();
  private players: RoomPlayer[] = [];
  private snapshots: Record<string, BuddyBodySave[]> = {};
  private poseBaselines = new Map<string, number[]>();
  private poseSequences = new Map<string, number>();
  private lastPoseSent = new Map<string, number>();
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
    this.localId = `player-${Math.random().toString(36).slice(2, 12)}`;
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
    this.players = [{ id: this.localId, name: this.name, owner: true, color: this.color }];
    this.room.ownerId = this.localId;
    this.room.players = [...this.players];
    this.callbacks.onState(this.room);
    this.callbacks.onStatus("Room ready");
    return this.room;
  }

  private openHostPeer(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerIdFor(code), { debug: 0 });
      this.peer = peer;
      let settled = false;
      peer.on("open", () => { settled = true; resolve(); });
      peer.on("connection", (connection) => this.acceptConnection(connection));
      peer.on("error", (error) => {
        if (!settled) reject(error);
        else if (error.type === "disconnected") this.callbacks.onStatus("Signaling connection interrupted");
        else this.callbacks.onError(error.message || "Room connection error");
      });
      peer.on("disconnected", () => { if (!this.closed && this.isOwner) void peer.reconnect(); });
    });
  }

  async join(codeInput: string) {
    const code = codeInput.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("Enter a valid 6-character room code.");
    this.closed = false;
    this.room = { code, mapId: "park", maxPlayers: 8, ownerId: "", players: [] };
    this.callbacks.onStatus("Finding room...");
    const peer = new Peer(undefined, { debug: 0 });
    this.peer = peer;
    await new Promise<void>((resolve, reject) => {
      peer.on("open", () => resolve());
      peer.on("error", (error) => reject(new Error(error.message || "Could not connect to signaling service.")));
    });
    await this.connectToHost(code);
    return this.room!;
  }

  private connectToHost(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = this.peer;
      if (!peer) return reject(new Error("Peer connection is not ready."));
      const connection = peer.connect(peerIdFor(code), { reliable: true, serialization: "binary-utf8" });
      this.hostConnection = connection;
      let gotWelcome = false;
      connection.on("open", () => connection.send({ type: "hello", playerId: this.localId, name: this.name, color: this.color } satisfies Packet));
      connection.on("data", (raw) => {
        const packet = raw as Packet;
        if (packet.type === "reject") { reject(new Error(packet.reason)); return; }
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
      connection.on("error", (error) => { if (!gotWelcome) reject(new Error(error.message || "Room not found. Check the code.")); });
      window.setTimeout(() => { if (!gotWelcome) reject(new Error("Room not found. Check the code and try again.")); }, 12000);
    });
  }

  private acceptConnection(connection: DataConnection) {
    let connectedPlayerId = "";
    connection.on("data", (raw) => {
      const packet = raw as Packet;
      if (packet.type === "hello") {
        if (!this.room || (this.players.length >= this.room.maxPlayers && !this.players.some((player) => player.id === packet.playerId))) {
          connection.send({ type: "reject", reason: "This room is full." } satisfies Packet);
          connection.close();
          return;
        }
        const player: RoomPlayer = { id: packet.playerId, name: String(packet.name || "Player").slice(0, 18), color: /^#[0-9a-f]{6}$/i.test(packet.color) ? packet.color : "#2fd3cb", owner: packet.playerId === this.room.ownerId };
        connectedPlayerId = player.id;
        const previous = this.connections.get(player.id);
        this.connections.set(player.id, connection);
        if (previous && previous !== connection) previous.close();
        this.players = this.players.filter((entry) => entry.id !== player.id);
        this.players.push(player);
        this.broadcastState(connection);
        connection.send({ type: "welcome", state: this.room! } satisfies Packet);
        connection.send({ type: "snapshots", snapshots: this.snapshots } satisfies Packet);
        this.callbacks.onState(this.room);
      } else if (packet.type === "pose") {
        if (!this.players.some((player) => player.id === packet.playerId)) return;
        if (!this.applyPose(packet)) return;
        this.broadcast(packet, connection);
        this.callbacks.onSnapshots(this.snapshots);
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
      if (this.isOwner && connectedPlayerId && this.connections.get(connectedPlayerId) === connection) this.removePlayer(connectedPlayerId);
    });
  }

  private applyPose(packet: Extract<Packet, { type: "pose" }>) {
    const previous = this.poseBaselines.get(packet.playerId);
    const lastSequence = this.poseSequences.get(packet.playerId) ?? 0;
    if (packet.seq <= lastSequence || (!packet.full && !previous)) return false;
    const values = packet.full ? [...packet.values] : [...previous!];
    if (!packet.full) {
      for (let i = 0; i + 1 < packet.values.length; i += 2) {
        const index = packet.values[i];
        const value = packet.values[i + 1];
        if (!Number.isInteger(index) || index < 0 || index >= values.length || !Number.isInteger(value)) return false;
        values[index] = clampInt16(value);
      }
    }
    if (values.length % VALUES_PER_BODY !== 0 || values.length / VALUES_PER_BODY > BODY_KEYS.length) return false;
    this.poseBaselines.set(packet.playerId, values);
    this.poseSequences.set(packet.playerId, packet.seq);
    this.snapshots[packet.playerId] = expandPose(values);
    return true;
  }

  private handleHostPacket(packet: Packet) {
    if (packet.type === "state") this.applyState(packet.state);
    else if (packet.type === "snapshots") {
      this.snapshots = packet.snapshots;
      for (const [id, bodies] of Object.entries(packet.snapshots)) {
        const values = quantize(bodies);
        this.poseBaselines.set(id, values);
      }
      this.callbacks.onSnapshots(this.snapshots);
    } else if (packet.type === "pose") {
      if (this.applyPose(packet)) this.callbacks.onSnapshots(this.snapshots);
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

  private broadcast(packet: Packet, except?: DataConnection) {
    for (const connection of this.connections.values()) if (connection !== except && connection.open) connection.send(packet);
  }

  private broadcastState(except?: DataConnection) {
    if (!this.room) return;
    this.room.players = [...this.players];
    this.room.players.forEach((player) => player.owner = player.id === this.room!.ownerId);
    const packet: Packet = { type: "state", state: this.room };
    this.broadcast(packet, except);
  }

  private removePlayer(id: string) {
    this.connections.delete(id);
    this.players = this.players.filter((player) => player.id !== id);
    delete this.snapshots[id];
    this.poseBaselines.delete(id);
    this.poseSequences.delete(id);
    this.lastPoseSent.delete(id);
    if (!this.room) return;
    this.broadcastState();
    this.callbacks.onState(this.room);
    this.callbacks.onSnapshots(this.snapshots);
    if (!this.players.length) void this.leave(false);
  }

  sendSnapshot(bodies: BuddyBodySave[]) {
    if (this.closed || !this.room || !bodies.length) return;
    const now = performance.now();
    const next = quantize(bodies);
    const previous = this.poseBaselines.get(this.localId);
    const lastSent = this.lastPoseSent.get(this.localId) ?? 0;
    const full = !previous || now - lastSent > 1200;
    const changes: number[] = [];
    if (full) changes.push(...next);
    else for (let i = 0; i < next.length; i++) if (next[i] !== previous[i]) changes.push(i, next[i]);
    if (!full && changes.length === 0 && now - lastSent < 1000) return;
    const packet: Packet = {
      type: "pose", playerId: this.localId,
      seq: (this.poseSequences.get(this.localId) ?? 0) + 1,
      full, values: changes,
    };
    this.poseBaselines.set(this.localId, next);
    this.poseSequences.set(this.localId, packet.seq);
    this.lastPoseSent.set(this.localId, now);
    this.snapshots[this.localId] = expandPose(next);
    if (this.isOwner) {
      this.broadcast(packet);
      this.callbacks.onSnapshots(this.snapshots);
    } else if (this.hostConnection?.open) {
      this.hostConnection.send(packet);
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
      this.promotionTimer = null;
      if (this.closed) return;
      if (promote) {
        this.isOwner = true;
        void this.openHostPeer(code).then(() => {
          if (this.room) {
            this.room.ownerId = this.localId;
            this.players = this.players.map((player) => ({ ...player, owner: player.id === this.localId }));
            this.room.players = [...this.players];
            this.broadcastState();
            this.callbacks.onState(this.room);
          }
        }).catch(() => this.callbacks.onError("Room ownership transfer failed. The room may have closed."));
      } else {
        const peer = new Peer(undefined, { debug: 0 });
        this.peer = peer;
        peer.on("open", () => { void this.connectToHost(code).catch(() => this.tryRecoverHost(code)); });
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
    if (!next) { this.callbacks.onState(null); return; }
    this.promotionTimer = window.setTimeout(() => {
      this.promotionTimer = null;
      if (next.id === this.localId) {
        this.isOwner = true;
        this.peer?.destroy();
        const peer = new Peer(peerIdFor(code), { debug: 0 });
        this.peer = peer;
        peer.on("open", () => {
          if (this.room) {
            const previousOwner = this.room.ownerId;
            this.room.ownerId = this.localId;
            this.players = this.players.filter((player) => player.id !== previousOwner).map((player) => ({ ...player, owner: player.id === this.localId }));
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
        const state = { ...this.room, ownerId: next.id, players: this.players.filter((player) => player.id !== this.localId).map((player) => ({ ...player, owner: player.id === next.id })) };
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
    this.poseBaselines.clear();
    this.poseSequences.clear();
    this.lastPoseSent.clear();
    this.room = null;
    this.isOwner = false;
    this.callbacks.onSnapshots({});
    this.callbacks.onState(null);
    this.callbacks.onStatus("Left room");
  }
}
