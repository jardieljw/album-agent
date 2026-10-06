/**
 * Utilitários de formatação de dados reais do sistema.
 */

/**
 * Formata um tamanho em bytes para a unidade mais adequada (B, KB, MB, GB).
 * Se o valor for nulo, indefinido ou menor/igual a zero, retorna o fallback (padrão 'Tam. N/D')
 * para nunca exibir valores enganosos como '0.0 MB'.
 *
 * Exemplos:
 * - 0 ou null -> 'Tam. N/D'
 * - 450 -> '450 B'
 * - 153646 -> '150 KB'
 * - 2500000 -> '2.4 MB'
 * - 3500000000 -> '3.26 GB'
 */
export function formatFileSize(bytes?: number | null, fallback: string = 'Tam. N/D'): string {
  if (bytes === undefined || bytes === null || bytes <= 0 || isNaN(bytes)) {
    return fallback;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    // Menos de 1 MB: exibir em KB com precisão de inteiros (ou 1 casa se for muito pequeno)
    return kb < 10 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    // De 1 MB a 1 GB: exibir em MB com 1 casa decimal
    return `${mb.toFixed(1)} MB`;
  }

  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}
