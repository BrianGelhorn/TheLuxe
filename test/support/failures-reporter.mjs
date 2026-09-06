import { inspect } from 'node:util';

export default async function* report(events) {
  for await (const { type, data } of events) {
    if (type === 'test:fail') yield `${data.name}\n${inspect(data.details.error, { depth: 5, colors: false })}\n\n`;
    if (type === 'test:summary' && !data.file) yield `${inspect(data, { depth: 2, colors: false })}\n`;
    if (type === 'test:coverage') yield `${inspect(data.summary, { depth: 4, colors: false })}\n`;
  }
}
