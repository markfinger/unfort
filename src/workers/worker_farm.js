import workerFarm from 'worker-farm';
import {createMockWorkers} from './mock_workers';

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
    end() {
      workerFarm.end(workers);
    },
    _workers: workers
  }
}