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

    // Listen for system exit signals
    const setupSignalHandlers = () => {
        const cleanup = () => {
            stopServer();
        };

        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);
        process.once('SIGABRT', cleanup);
        process.once('SIGTSTP', cleanup);
    };

    return {
        name: 'reload-sse-notifier',

        watchChange(id) {
            changedFiles.add(path.relative(process.cwd(), id));
        },

        buildStart() {
            if (!serverStarted && this.meta.watchMode) {
                console.log(`[sse-build-notifier] Starting SSE server at http://localhost:${port}/watch`);

                server = http.createServer((req, res) => {
                    if (req.url === '/watch') {
                        res.writeHead(200, {
                            'Content-Type': 'text/event-stream',
                            'Cache-Control': 'no-cache',
                            'Connection': 'keep-alive',
                            'Access-Control-Allow-Origin': '*',
                        });
                        res.write('\n');
                        clients.push(res);

                        req.on('close', () => {
                            clients = clients.filter(client => client !== res);
                        });
                    } else {
                        res.writeHead(404);
                        res.end();
                    }
                });

                server.listen(port, () => {
                    console.log(`[sse-build-notifier] SSE server running at http://localhost:${port}/watch`);
                });
                server.on('error', err => {
                    console.error(`[sse-build-notifier] SSE server encountered an error: `, err);
                });

                serverStarted = true;
                setupSignalHandlers();
            }
        },

        writeBundle() {
            if (this.meta.watchMode && clients.length > 0) {
                const fileList = Array.from(changedFiles);
                const payload = JSON.stringify({
                    timestamp: new Date().toISOString(),
                    changedFiles: fileList
                });

                console.log(`[reload-sse-notifier] Sending reload event to ${clients.length} connected client(s) (changed files: ${fileList.length})`);

                clients.forEach(res => {
                    res.write(`event: reload\n`);
                    res.write(`data: ${payload}\n\n`);
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
