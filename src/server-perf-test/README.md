Localhost HTTP1 file server performance test
============================================

This is a collection of scripts that seek to test the performance characteristics
of a browser loading hundreds of files from `http://127.0.0.1` addresses.

After testing documents linking to 100, 300, and 500 script files, the final conclusion
was that there are no no measurable gains by splitting your servers.

As long as your origin server is non-blocking - and does not perform CPU-intensive work
that will block the event loop - you should probably serve the files from the same server.

The results are contained in `data.json` and `data_second_run.json`. While some results
show performance gains when you use 3 file servers (besides the origin server), these
results cannot be replicated consistently and are likely to be reflections of system load.

The tests were run against `Chrome/47.0.2526.111` and `Firefox/41.0` on an OSX machine.