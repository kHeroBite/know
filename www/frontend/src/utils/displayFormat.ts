/**
 * 도메인/워크스페이스 표시 포맷 헬퍼 — 전역 통일
 *
 * 포맷:
 *   - formatDomain(id, label)      → 한글명(영문id) 또는 영문id
 *   - formatWorkspace(ws, id, label) → 워크스페이스:한글명(영문id)
 */

export function formatDomain(
  id: string | null | undefined,
  label?: string | null
): string {
  if (!id) return ''
  return label ? `${label}(${id})` : id
}

export function formatWorkspace(
  ws: string | null | undefined,
  domainId: string | null | undefined,
  domainLabel?: string | null
): string {
  if (!ws) return ''
  if (!domainId) return ws
  return `${ws}:${formatDomain(domainId, domainLabel)}`
}
