import { BrowserRenderingMode } from "./surfaceBase";
import { WebGlRenderTarget } from "./webGlRenderTarget";
import { WebRenderTarget } from "./webRenderTarget";

export class WebRenderTargetRegistry {
    private static targets: { [id: number]: (WebRenderTarget) } = {};
    private static registry: { [id: number]: ({
        canvas: HTMLCanvasElement;
        worker?: Worker;
    }); } = {};

    private static nextId = 1;

    static create(pthreadId: number, canvas: HTMLCanvasElement, preferredModes: BrowserRenderingMode[]): number {
        const id = WebRenderTargetRegistry.nextId++;
        if (pthreadId === 0) {
            WebRenderTargetRegistry.registry[id] = {
                canvas
            };
            WebRenderTargetRegistry.targets[id] = WebRenderTargetRegistry.createRenderTarget(canvas, preferredModes);
        } else {
            const self = globalThis as any;
            const module = self.Module ?? self.getDotnetRuntime(0)?.Module;
            const pthreads = module?.PThread;
            if (pthreads == null) { throw new Error("Unable to access emscripten PThread api"); }
            const pthread = pthreads.pthreads[pthreadId];
            if (pthread == null) { throw new Error(`Unable get pthread with id ${pthreadId}`); }
            let worker: Worker | undefined;
            if (pthread.postMessage != null) { worker = pthread as Worker; } else { worker = pthread.worker; }

            if (worker == null) { throw new Error(`Unable get Worker for pthread ${pthreadId}`); }
            const offscreen = canvas.transferControlToOffscreen();
            worker.postMessage({
                avaloniaCmd: "registerCanvas",
                canvas: offscreen,
                modes: preferredModes,
                id
            }, [offscreen]);
            WebRenderTargetRegistry.registry[id] = {
                canvas,
                worker
            };
        }
        return id;
    }

    static initializeWorker() {
        const oldHandler = self.onmessage;
        self.onmessage = ev => {
            const msg = ev;
            if (msg.data.avaloniaCmd === "registerCanvas") {
                WebRenderTargetRegistry.targets[msg.data.id] = WebRenderTargetRegistry.createRenderTarget(msg.data.canvas, msg.data.modes);
            } else if (msg.data.avaloniaCmd === "unregisterCanvas") {
                /* eslint-disable */
                // Our keys are _always_ numbers and are safe to delete
                delete WebRenderTargetRegistry.targets[msg.data.id];
                /* eslint-enable */
            } else if (oldHandler != null) { oldHandler.call(self, ev); }
        };
    }

    static getRenderTarget(id: number): WebRenderTarget | undefined {
        return WebRenderTargetRegistry.targets[id];
    }

    private static createRenderTarget(canvas: HTMLCanvasElement | OffscreenCanvas, modes: BrowserRenderingMode[]): WebRenderTarget {
        return new WebGlRenderTarget(canvas, BrowserRenderingMode.WebGL1);
    }
}
