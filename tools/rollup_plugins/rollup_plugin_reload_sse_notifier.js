import http from 'http';
import path from 'path';


/**
 * A Rollup plugin that starts an SSE (Server-Sent Events) server, notifying
 * connected clients when a build completes.
 *
 * - Only runs when Rollup is in watch mode.
 * - Sends a single `build` event per completed build via SSE.
 * - Includes a list of changed file paths in the event payload.
 *
 * @param {Object} [options]
 * @param {number} [options.port=35729] - The port to run the SSE server on.
 * @returns {import('rollup').Plugin}
 */
export default function reloadSSENotifier({ port = 35729 } = {}) {
    let clients = [];
    let serverStarted = false;
    let changedFiles = new Set();
    let server = null;

    function stopServer() {
        if (server) {
            console.log('[sse-build-notifier] Shutting down SSE server...');
            server.close();
            server.closeAllConnections();
            clients = [];
            server = null;
            serverStarted = false;
            process.exit(0);
        }
    }

    function sendEvent(event, data) {
        clients.forEach(res => {
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        });
    }

    return {
        name: 'reload-sse-notifier',
        watchChange(id) {
            changedFiles.add(path.relative(process.cwd(), id));
        },
        buildStart() {
            // This plugin only has an effect in watch mode:
            if (!this.meta.watchMode) return;

            // Start the server:
            if (!serverStarted) {
                console.log(`[sse-build-notifier] Starting SSE server at http://localhost:${port}/watch`);
                server = _createServer(
                    (client) => clients.push(client),
                    (client) => clients = clients.filter(c => c !== client),
                );
                server.listen(port, () => {
                    console.log(`[sse-build-notifier] SSE server running at http://localhost:${port}/watch`);
                });
                server.on('error', err => {
                    console.error(`[sse-build-notifier] SSE server encountered an error: `, err);
                });
                serverStarted = true;

                // When the process is killed, stop the server gracefully:
                setupExitHandler(stopServer);
            }

            sendEvent('rebuild-started', {timestamp: new Date().toISOString()});
        },
        buildEnd(error) {
            if (!this.meta.watchMode) return;

            if (error) {
                sendEvent('rebuild-failed', {
                    timestamp: new Date().toISOString(),
                    error: {
                        message: error.message,
                        stack: error.stack,
                    },
                });
            }
        },
        writeBundle() {
            if (!this.meta.watchMode) return;

            if (clients.length > 0) {
                const fileList = Array.from(changedFiles);

                console.log(`[reload-sse-notifier] Sending reload event to ${clients.length} connected client(s) (changed files: ${fileList.length})`);

                sendEvent('rebuild-finished', {
                    timestamp: new Date().toISOString(),
                    changedFiles: fileList
                });

                changedFiles.clear();
            } else if (clients.length === 0) {
                console.log(`[reload-sse-notifier] No client connected; not sending reload event`);
            }
        },

        closeWatcher() {
            stopServer();
        }
    };
}



function _createServer(onClientAdded, onClientRemoved) {
    return http.createServer((req, resp) => {
        if (req.url === '/watch') {
            resp.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });
            resp.write('\n');
            onClientAdded(resp);

            req.on('close', () => {
                onClientRemoved(resp);
            });
        } else {
            resp.writeHead(404);
            resp.end();
        }
    });
}

// Listen for system exit signals
const setupExitHandler = (callback) => {
    const cleanup = () => {
        callback();
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('SIGABRT', cleanup);
    process.once('SIGTSTP', cleanup);
};
