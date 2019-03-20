import UnixSock from "./unixsock";
import IOEater from "./ioeater";

/** Handle connection to an existing memcached unix socket.
 *
 * Based on the memcached protocol:
 * https://github.com/memcached/memcached/blob/master/doc/protocol.txt
 */
export default class MemCSock {
  constructor(socketPath) {
    const socket = new UnixSock(socketPath);
    this._ioEater = new IOEater(socket);
  }

  /** Establish connection to the socket
   *
   * @return {Promise}
   */
  connect() {
    return this._ioEater.connect();
  }

  /** Close the socket
   *
   * @return {Promise}
   */
  disconnect() {
    return this._ioEater.close();
  }

  _checkKeyValid(key) {
    return new Promise(resolve => {
      if (key.indexOf(" ") != -1) {
        throw new Error("Key can't contain space");
      }
      resolve();
    });
  }

  /** Effective set write */
  _cmdSet(key, flags, expiration, value) {
    const prepareCommand = ({key, flags, expiration, value}) =>
      `set ${key} ${flags} ${expiration} ${value.length}\r\n${value}\r\n`;
    const handleReply = data => {
      const lines = data.split("\r\n");
      if (lines[0].startsWith("ERROR")
        || lines[0].startsWith("CLIENT_ERROR")
        || lines[0].startsWith("SERVER_ERROR")) {
        throw new Error(lines[0]);
      }
      if (lines[0] != "STORED") {
        throw new Error(lines[0]);
      }
      return {
        reply: true,
        used: "STORED\r\n".length,
      };
    };

    return this._ioEater.sendCommand({
      name: "SET",
      prepareCommand,
      handleReply,
    }, {
      key,
      flags,
      expiration,
      value,
    });
  }

  /** Set a key in memcached
   *
   * @return {Promise}
   */
  set(key, value) {
    return this._checkKeyValid(key)
      .then(() => this._cmdSet(key, 0, 0, value));
  }

  /** Effective get write */
  _cmdGet(key) {
    const prepareCommand = key => {
      return `get ${key}\r\n`;
    };
    const handleReply = data => {
      const lines = data.split("\r\n");
      if (lines[0].startsWith("ERROR")
        || lines[0].startsWith("CLIENT_ERROR")
        || lines[0].startsWith("SERVER_ERROR")) {
        throw new Error(lines[0]);
      }
      let value;
      let used;
      const valueHeader = `VALUE ${key} 0 `;
      const endHeader = "END\r\n";
      if (data.startsWith(valueHeader)) {
        const endLine = data.indexOf("\r\n");
        const dataSize = parseInt(data.slice(
          valueHeader.length,
          endLine));
        const dataStart = endLine + 2;
        const dataEnd = dataStart + dataSize;
        value = data.slice(endLine + 2, endLine + 2 + dataSize);
        if (data.slice(dataEnd + 2, dataEnd + 2+ endHeader.length)
          != endHeader) {
          throw new Error("Invalid get reply");
        }
        used = dataEnd + 2 + endHeader.length;
      } else if (data.startsWith("END\r\n")) {
        value = null;
        used = endHeader.length;
      } else {
        throw new Error("Unexpected get reply");
      }
      return {
        reply: value,
        used: used,
      };
    };

    return this._ioEater.sendCommand({
      name: "GET",
      prepareCommand,
      handleReply,
    }, key);
  }

  /** Get a key from memcached
   *
   * @return {Promise}
   */
  get(key) {
    return this._checkKeyValid(key)
      .then(() => this._cmdGet(key));
  }
}
