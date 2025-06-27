import net from "node:net";

export async function getAvailablePort(startingFrom = 1024, maxPort = 65535) {
  if (startingFrom > maxPort) {
    throw new Error(
      `Starting port ${startingFrom} exceeds maximum port ${maxPort}`,
    );
  }

  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.listen(startingFrom, () => {
      const port = (server.address() as net.AddressInfo)?.port;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Failed to get port from server"));
        }
      });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        // Port is in use, try the next one
        if (startingFrom + 1 > maxPort) {
          reject(
            new Error(
              `No available ports found in range ${startingFrom - (startingFrom - 1024)}-${maxPort}`,
            ),
          );
          return;
        }
        getAvailablePort(startingFrom + 1, maxPort)
          .then(resolve)
          .catch(reject);
      } else {
        reject(err);
      }
    });
  });
}
