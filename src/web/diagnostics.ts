export const formatWebError = (
  error: unknown,
  secrets: (string | undefined)[] = []
) => {
  const description =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : 'Unknown error';
  let safe = description.replace(
    /mongodb(?:\+srv)?:\/\/[^\s"']+/gi,
    'mongodb://[redacted]'
  );
  for (const secret of secrets) {
    if (!secret) continue;
    for (const value of new Set([secret, encodeURIComponent(secret)])) {
      safe = safe.split(value).join('[redacted]');
    }
  }
  return safe.slice(0, 3000);
};
