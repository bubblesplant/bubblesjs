type AnyRecord = Record<string, unknown>;

export function isPlainObject(value: unknown): value is AnyRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function deepMergeObject<T extends object>(source: T, target: Partial<T>) {
  const result = { ...source } as AnyRecord;

  for (const [key, value] of Object.entries(target)) {
    const sourceValue = result[key];
    result[key] =
      isPlainObject(sourceValue) && isPlainObject(value)
        ? deepMergeObject(sourceValue, value)
        : value;
  }

  return result as T;
}
