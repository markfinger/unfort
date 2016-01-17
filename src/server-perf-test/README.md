Localhost HTTP file server performance tests
============================================

This is a collection of scripts that seek to test the performance characteristics
of a browsers loading files from local addresses. In particular, I sought to resolve
if a browser will load hundreds of files faster from a single server or from multiple
servers.


Background
----------

The HTTP1 (and its revisions) state that browsers should only use a limited set of
parallel connections, which has created a situation where assets will often be served
from multiple hostnames to cirucumvent the browser's limitations.

Most browsers tend to ignore the specification, and will actually pull in multiple
assets at any time.

One of the key features of HTTP2 is that it reduces the overhead on opening multiple
parallel connections.


Tests & Conclusions
-------------------

### HTTP1

After testing documents linking to 100, 300, and 500 script files, the final conclusion
was that there are no measurable gains by splitting you service of files across localhost
ports.

As long as your origin server is non-blocking, you should probably serve the files from
the same server. This assumes that you are not performing CPU-intensive work in the server,
if so, you may experience event loop blocks which degrade the response times.

The results are contained in `data.json` and `data_second_run.json`. While some results
show performance gains when you use 3 file servers (besides the origin server), these
results cannot be replicated consistently and are likely to be reflections of system load.

The tests were run against `Chrome/47.0.2526.111` and `Firefox/41.0` on an OSX machine.


### HTTP2

Similarly, the results were inconsistent and ultimately inconclusive.

The tests were run against `Chrome/47.0.2526.111` and `Firefox/41.0` on an OSX machine.

The results are contained in `data_http2.json`.

Anecdotally, Chrome seems to improve its performance as more servers are added. From
a very limited set of data, 8 seems to be the sweet spot.

Firefox's performance seems to degrade as you start serving files from other localhost
ports.
