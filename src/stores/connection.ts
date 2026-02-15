import { createSignal } from "solid-js";

const [isConnected, setIsConnected] = createSignal(false);
const [peerCount, setPeerCount] = createSignal(0);
const [nodeStatus, setNodeStatus] = createSignal<
  "starting" | "running" | "stopped" | "error"
>("stopped");
const [relayConnected, setRelayConnected] = createSignal(true);

export {
  isConnected,
  setIsConnected,
  peerCount,
  setPeerCount,
  nodeStatus,
  setNodeStatus,
  relayConnected,
  setRelayConnected,
};
