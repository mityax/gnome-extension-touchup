import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Soup from "gi://Soup";
import {logger} from "$src/utils/logging";

type EventCallback = (data: string, event: string, id: string | null) => void;


/**
 * A basic SSE (Server-Sent-Events) client implementation using Soup.
 *
 * Usage example:
 *
 * ```js
 *     const eventSource = new EventSource('http://example.com/sse');
 *
 *     eventSource.on('message', (data, event, id) => {
 *         console.log(`Received event: ${event}, id: ${id}, data: ${data}`);
 *     });
 *
 *     eventSource.on('customEvent', (data) => {
 *         console.log(`Received custom event with data: ${data}`);
 *     });
 *
 *     await eventSource.start();
 *
 *     // Close the event source after 10 seconds
 *     setTimeout(() => eventSource.close(), 10000);
 * ```
 */
export default class EventSource {
    private session: Soup.Session;
    private readonly message: Soup.Message;
    private readonly uri: GLib.Uri;
    private stream: Gio.DataInputStream | null = null;
    private isOpen = false;
    private callbacks: Record<string, EventCallback[]> = {};

    constructor(url: string) {
        this.session = new Soup.Session();
        this.uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);

        this.message = new Soup.Message({
            method: 'GET',
            uri: this.uri,
        });

        // Set headers for SSE
        this.message.request_headers.append('Accept', 'text/event-stream');
    }

    async start() {
        if (this.isOpen) {
            throw new Error('EventSource is already open.');
        }

        this.isOpen = true;

        const stream = await new Promise<Gio.InputStream>((resolve, reject) => {
            this.session.send_async(this.message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                if (session === null) {
                    reject(new Error('Session is null'));
                } else {
                    try {
                        const inputStream = session.send_finish(result) as unknown as Gio.InputStream;
                        resolve(inputStream);
                    } catch (error) {
                        reject(error);
                    }
                }
            });
        });

        this.stream = new Gio.DataInputStream({ base_stream: stream });

        // Start reading the stream
        this.readStream();
    }

    private async readStream() {
        if (!this.stream) {
            return;
        }

        let buffer = '';
        while (this.isOpen) {
            try {
                const [line, length] = await new Promise<[Uint8Array | null, number]>((resolve, reject) => {
                    this.stream!.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, result) => {
                        if (stream === null) {
                            reject(new Error("Stream is null"));
                        } else {
                            try {
                                const line = stream.read_line_finish(result);
                                resolve(line);
                            } catch (error) {
                                if (!(error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))) {
                                    reject(error);
                                }
                            }
                        }
                    });
                });

                if (line === null) {
                    break;  // End of stream
                }

                const decodedLine = new TextDecoder().decode(line);

                if (decodedLine.trim() === '') {
                    // Parse and dispatch the event
                    this.parseEvent(buffer);
                    buffer = '';
                } else {
                    buffer += decodedLine + '\n';
                }
            } catch (error) {
                if (error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.TIMED_OUT)) {
                    // On a timeout error, we just let the loop continue with the next iteration (i.e. try
                    // to read another line).
                } else {
                    logger.error('[Live-reload] Error reading SSE stream:', error);
                    this.close();
                    break;
                }
            }
        }
    }

    private parseEvent(rawEvent: string) {
        const lines = rawEvent.split('\n');
        let data = '';
        let event = 'message';
        let id: string | null = null;

        for (const line of lines) {
            const [key, value] = line.split(/:(.*)/, 2).map(s => s.trim());

            if (key === 'data') {
                data += value + '\n';
            } else if (key === 'event') {
                event = value;
            } else if (key === 'id') {
                id = value;
            }
        }

        if (data.endsWith('\n')) {
            data = data.slice(0, -1);
        }

        this.dispatchEvent(event, data, id);
    }

    private dispatchEvent(event: string, data: string, id: string | null) {
        const callbacks = this.callbacks[event] || [];
        for (const callback of callbacks) {
            callback(data, event, id);
        }
    }

    on(event: string, callback: EventCallback) {
        if (!this.callbacks[event]) {
            this.callbacks[event] = [];
        }
        this.callbacks[event].push(callback);
    }

    off(event: string, callback: EventCallback) {
        if (!this.callbacks[event]) {
            return;
        }

        this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
    }

    close() {
        this.isOpen = false;
        this.session.abort();

        if (this.stream) {
            this.stream = null;
        }
    }
}

