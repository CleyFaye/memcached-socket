import UnixSock from "./unixsock";

/** Handle connection to an existing memcached unix socket.
 *
 * Based on the memcached protocol:
 * https://github.com/memcached/memcached/blob/master/doc/protocol.txt
 */
export default class MemCSock {
  constructor(socketPath) {
    this._sock = new UnixSock(socketPath);
  }

  /** Establish connection to the socket
   *
   * @return {Promise}
   */
  connect() {
    return this._sock.connect();
  }

  /** Close the socket
   *
   * @return {Promise}
   */
  disconnect() {
    return this._sock.disconnect();
  }

  _checkKeyValid(key) {
    if (key.indexOf(" ") != -1) {
      throw new Error("Key can't contain space");
    }
  }

  /** Set a key in memcached
   *
   * @return {Promise}
   */
  set(key, value) {
    return new Promise((resolve, reject) => {
      this._checkKeyValid(key);
      this._sock.write(
        `set ${key} 0 0 ${value.length}\r\n${value}\r\n`,
        true)
        .then(result => {
          if (!result.toString().startsWith("STORED")) {
            throw new Error("Couldn't store key");
          }
        })
        .then(() => resolve())
        .catch(err => reject(err));
    });
  }

  /** Get a key from memcached
   *
   * @return {Promise}
   */
  get(key) {
    return new Promise((resolve, reject) => {
      this._checkKeyValid(key);
      this._sock.write(
        `get ${key}\r\n`,
        true)
        .then(result => {
          result = result.toString();
          if (result.startsWith("ERROR")) {
            reject(result);
          }
          const split = result.split("\r\n");
          if (!split[0].startsWith(
            `VALUE ${key} 0 `)) {
            resolve(null);
            return;
          }
          const argSplit = split[0].split(" ");
          const size = parseInt(argSplit[3]);
          const data = split[1].toString().substr(0, size);
          resolve(data);
        });
    });
  }
};
