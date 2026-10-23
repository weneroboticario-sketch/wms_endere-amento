export async function readStockPages(fetchPage, onProgress) {
  const pageSize = 1000;
  const rows = [];
  let offset = 0;
  let concurrency = 1;
  while (true) {
    const pages = await Promise.all(Array.from({ length: concurrency }, (_, index) => fetchPage(offset + index * pageSize, pageSize)));
    let finished = false;
    for (const page of pages) {
      if (finished && page.length) throw new Error("A base mudou durante a leitura. Tente novamente.");
      rows.push(...page);
      if (page.length < pageSize) finished = true;
    }
    if (onProgress) await onProgress(rows.length);
    if (finished) return rows;
    offset += concurrency * pageSize;
    concurrency = 3;
  }
}
