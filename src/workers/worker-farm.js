import workerFarm from 'worker-farm';
import {createMockWorkers} from './mock-workers';

const mockWorkers = createMockWorkers();

export function callFunction() {
  mockWorkers.callFunction.apply(this, arguments);
}

export function createWorkerFarm() {
  const workers = workerFarm(__filename, ['callFunction']);

  return {
    callFunction() {
      workers.callFunction.apply(this, arguments);
    },
    killWorkers() {
      workerFarm.end(workers);
    },
    _workers: workers
  }
}