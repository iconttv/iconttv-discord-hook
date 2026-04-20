const trackedArchiveWork = new Set<Promise<unknown>>();

let archiveShutdownRequested = false;

export const requestArchiveShutdown = () => {
  if (archiveShutdownRequested) {
    return false;
  }

  archiveShutdownRequested = true;
  return true;
};

export const isArchiveShutdownRequested = () => {
  return archiveShutdownRequested;
};

export const trackArchiveWork = async <T>(work: Promise<T>) => {
  trackedArchiveWork.add(work);

  try {
    return await work;
  } finally {
    trackedArchiveWork.delete(work);
  }
};

export const waitForTrackedArchiveWork = async () => {
  await Promise.allSettled(Array.from(trackedArchiveWork));
};
