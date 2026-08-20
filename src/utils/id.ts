export const generateId = (): string => {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

export const nowTimestamp = (): number => Date.now();
