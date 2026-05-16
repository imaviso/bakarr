export function parseVolumeNumbersFromTitle(title: string) {
  const explicitValues = [
    ...title.matchAll(/(?:^|[\s._[(-])vol(?:ume)?\.?[\s._-]*(\d{1,3})(?:\b|[\s._)\]-])/gi),
  ]
    .map((match) => Number.parseInt(match[1] ?? "", 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (explicitValues.length > 0) {
    return [...new Set(explicitValues)];
  }

  const bareValues = [...title.matchAll(/(?:^|[\s._[(-])v[\s._-]*(\d{1,3})(?:\b|[\s._)\]-])/gi)]
    .map((match) => Number.parseInt(match[1] ?? "", 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  return [...new Set(bareValues)];
}
