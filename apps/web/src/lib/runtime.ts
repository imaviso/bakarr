import { Layer, ManagedRuntime } from "effect";
import { AuthService } from "~/lib/effect/auth-service";
import { SocketService } from "~/lib/effect/socket-service";

const SocketServiceProvided = SocketService.Live.pipe(Layer.provide(AuthService.Live));

const AppLayer = Layer.merge(AuthService.Live, SocketServiceProvided);

export const appRuntime = ManagedRuntime.make(AppLayer);
