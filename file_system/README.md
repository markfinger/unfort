Interaction Models
------------------

### File System Watcher -> File System Cache -> File System Scope -> File System Trap

#### On file added

```
if (
  file has been cached and
  (isFile has been resolved or is pending)
):
    resolve file's isFile:
      if file.isFile === false:
        for trap in traps:
          if trap.isFile
```

#### on file removed


#### on file changed