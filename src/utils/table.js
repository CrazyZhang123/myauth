/**
 * 生成简单 ASCII 表格
 * @param {string[]} headers - 表头
 * @param {Array<Array<string | number | null | undefined>>} rows - 表格数据
 * @returns {string}
 */
export function renderTable(headers, rows) {
  const normalizedRows = rows.map((row) =>
    row.map((value) => String(value ?? '-'))
  );

  const widths = headers.map((header, columnIndex) => {
    const columnValues = normalizedRows.map((row) => row[columnIndex] || '');
    return Math.max(header.length, ...columnValues.map((value) => value.length));
  });

  const renderRow = (row) =>
    row
      .map((value, index) => String(value ?? '-').padEnd(widths[index]))
      .join(' | ');

  const separator = widths.map((width) => '-'.repeat(width)).join('-|-');

  return [renderRow(headers), separator, ...normalizedRows.map(renderRow)].join('\n');
}
