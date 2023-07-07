import { TransformCustomScalars } from './TransformCustomScalars';

export function getSdkWrapper(transformer: TransformCustomScalars) {
  return async function sdkWrapper<T>(
    action: () => Promise<T>,
    operationName: string,
    operationType?: string,
  ) {
    const res = await action();
    if (!operationType) {
      throw new Error('Operation type is not defined');
    }
    return transformer.addCustomScalars(res, operationType as 'query' | 'mutation');
  };
}
