import { useSocketEvents } from "~/hooks/use-socket-events";

export function SocketToastListener() {
  useSocketEvents();
  return null;
}
