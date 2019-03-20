# memcached-socket
A simple layer to interface with a memcached socket.

This is a quick and dirty project; you can see the lack of tests, and the lack of rigor in the code.
While it works, there is no guarantees whatsoever that it won't lose a promise here or deadlock a call there.

## Goal & Future
Implement a simple get/set interface to a local memcached instance accessible through a UNIX socket.
The implementation is made using promises, so it is compatible with both promises and async/await.

Since it didn't end up being used, development stopped quite quickly.
I believe with little work it would be possible to clean the existing codebase (which, again, seems to work fine).
Very little additional work is required to implement calls other than set/get.
Again, with little work (almost none…) it would be possible to connect to a memcached server using TCP.
Worst issue is that the code more or less expect to get string everywhere, which might not be true.
Again, not a big deal, but not worth fixing right now.

Since I don't have a real use for all that, development will not continue, unless someone think it is useful.

I'll leave this here since it might be useful as a learning tool (for what to do or for what not to do, you'll decide).

## Basic usage

After having created an instance of `MemCSock`, you can call three methods:

### MemCSock.set(key, value)
Set a key in memcached.
Value should be a string, key too.
The key can't have spaces in it.

Returns a promise that resolve once the value is actually stored.
If the value can't be stored, reject the promise.

### MemCSock.get(key)
Return the value of a key.
Same key restriction as set().

Returns a promise that resolve with the value from the cache, or null if the value isn't in the cache.
This should never throw except from a server failure (but it might, again, untested stuff).

### MemCSock.disconnect()
Close the socket, terminate pending operations.
This allows the node process to cleanly exit instead of stalling forever and requiring the process to be killed.

## Example
```JavaScript
import MemCSock from "@cley_faye/memcached-socket";

const memc = new MemCSock("/var/run/memcached/sock");

memc.set("someKey", 34)
  .then(() => console.log("someKey set"))
  .then(() => memc.get("someKey"))
  .then(val => {
    console.log(`Read: ${val}, expected: 34`);
  })
  .then(() => memc.disconnect());
```

The disconnect call is only useful if you want your application to terminate cleanly.

## Error handling
Minimal. If a request fail, all pending requests are terminated.
