import {createConnection} from "net";

/** Handle connection to an existing unix socket */
export default class UnixSock {
  constructor(socketPath) {
    this._socketPath = socketPath;
  }

  /** Try to gracefully handle errors.
   *
   * This is race-condition land
   */
  _socketCallHandler(eventName, resolve, reject) {
    const errorHandler = () => {
      this._sock.removeAllListener(eventName);
      reject();
    };
    if (this._sock) {
      this._sock.once("error", errorHandler);
    }
    return (...args) => {
      this._sock.removeListener("error", errorHandler);
      resolve.apply(null, args);
    };
  }

  /** Establish connection to the socket
   *
   * @return {Promise}
   */
  connect() {
    return new Promise((resolve, reject) => {
      const errorHandler = () => {
        this._sock.removeAllListener("connect");
        reject();
      };
      this._sock = createConnection(
        this._socketPath,
        this._socketCallHandler("connect", resolve, reject));
      this._sock.once("error", errorHandler);
    });
  }

  /** Close the socket
   *
   * @return {Promise}
   */
  disconnect() {
    // TODO This might not be able to throw an error, check it
    return new Promise((resolve, reject) => {
      this._sock.end(this._socketCallHandler("close", resolve, reject));
    });
  }

  /** Write a raw buffer to the socket.
   *
   * @param {bool} waitData
   * If we're expecting data, wait for a read to happen
   *
   * @return {Promise}
   * The promise will return with the read data if any (and requested)
   */
  write(buffer, waitData) {
    if (waitData) {
      return new Promise((resolve, reject) => {
        this._sock.once(
          "data",
          this._socketCallHandler("data", resolve, reject));
        this._sock.write(
          buffer,
          this._socketCallHandler("write", () => {}, reject));
      })
    } else {
      return new Promise((resolve, reject) => {
        this._sock.write(
          buffer,
          this._socketCallHandler("write", resolve, reject));
      });
    }
  }
};
