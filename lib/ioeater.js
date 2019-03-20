/*eslint-env node */
import AsyncLock from "async-lock";

/** Class that handle sending/reading from an IO socket that expect synchronous
 * operations.
 *
 * This create an internal queue of read handler and manage writing in an
 * ordered fashion to avoid synchronization issues.
 */
export default class IOEater {
  /** Constructor
   *
   * @param {UnixSock|TCPSock} ioSock
   * Socket to use for communication. All further read/write operations are
   * handled by this instance.
   */
  constructor(ioSock) {
    this._sock = ioSock;
    this._lock = new AsyncLock();
    this._requests = [];
    this._inBuffer = Buffer.alloc(0);
  }

  /** Passthru to socket connect() */
  connect() {
    return this._sock.connect()
      .then(() => this._sock.onData(data => this._handleRead(data)));
  }

  /** Send a command to the socket.
   *
   * @param {Object} cmdDef
   * Command definition. How the data are sent and how to handle the reply.
   *
   * @param {function(args):string} cmdDef.prepareCommand
   * Function that takes args and prepare the buffer to be sent.
   *
   * @param {function(data:string):Object} cmdDef.handleReply
   * Function that takes the read data from the socket and handle them.
   * If there is not enough data available, must return null.
   * Otherwise must return an object with two properties:
   * - reply: the promise reply
   * - used: the number of bytes used from the data buffer
   * If an error happens, should throw an exception; the associated promise will
   * fail with that exception, while others will fail with short read.
   *
   * @return {Promise}
   * A promise that will resolve when a reply is received
   */
  sendCommand(cmdDef, args) {
    let resolveRead;
    let rejectRead;
    let result = new Promise((resolve, reject) => {
      resolveRead = resolve;
      rejectRead = reject;
    });
    setTimeout(() => this._lock.acquire("sock", () => {
      if (!this._sock) {
        throw new Error("Socket not open");
      }
      this._requests.push({
        def: cmdDef,
        args,
        resolve: resolveRead,
        reject: rejectRead,
        written: false,
      });
      if (this._requests.length == 1) {
        this._writeTopRequest();
      }
    }), 0);
    return result;
  }

  /** Cancel all pending operations and close the socket */
  close() {
    this._lock.acquire("sock", () => {
      this._requests.forEach(request =>
        request.reject(new Error("Socket closed")));
      this._requests = [];
      this._sock.disconnect();
      this._sock = null;
    });
  }

  /** Write the top request to the socket */
  _writeTopRequest() {
    setTimeout(() => this._lock.acquire("sock", () => {
      if (this._requests.length > 0) {
        const request = this._requests[0];
        if (request.written) {
          return;
        }
        const preparedData = request.def.prepareCommand(request.args);
        request.written = true;
        this._sock.write(preparedData);
      }
    }), 0);
  }

  /** Handle incoming data */
  _handleRead(data) {
    this._lock.acquire("sock", () => {
      if (this._requests.length == 0) {
        throw new Error("No pending requests but extra data received");
      }
      const request = this._requests[0];
      this._inBuffer += data.toString();
      try {
        const handlerReply = request.def.handleReply(this._inBuffer);
        if (handlerReply == null) {
          return;
        }
        this._inBuffer = this._inBuffer.slice(handlerReply.used);
        request.resolve(handlerReply.reply);
        this._requests = this._requests.slice(1);
        this._writeTopRequest();
      } catch (e) {
        request.reject(e);
        this._requests.slice(1).forEach(otherRequest =>
          otherRequest.reject(new Error("Invalid read in previous request")));
        this._requests = [];
      }
    });
  }
}
