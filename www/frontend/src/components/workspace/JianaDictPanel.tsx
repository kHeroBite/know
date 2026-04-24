import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Select, List, Spin, Button, Typography, Space, Empty, Tag } from 'antd'
import { FileTextOutlined, EditOutlined, ReloadOutlined, StarFilled } from '@ant-design/icons'
import 클라이언트 from '../../api/client'

const { Text } = Typography

// ─── 타입 ────────────────────────────────────────────────────────

interface DictFileInfo {
  name: string
  size: number
  mtime: number
}

// ─── 화이트리스트 / 즐겨찾기 정의 ────────────────────────────────

interface FileSpec {
  name: string
  desc: string
  star?: boolean
}

const GRAMMAR_FILES: FileSpec[] = [
  { name: 'cotton_prefer.list',      desc: '코튼 음절 기분析 사전 — 전체 어절 등록', star: true },
  { name: 'cotton_part_prefer.list', desc: '코튼 부분 기분析 사전 — 어절 일부 구간 분리', star: true },
  { name: 'cotton_post.list',        desc: '코튼 분析 후처리 사전' },
  { name: 'prefer.list',             desc: 'Full(자소) 기분析 사전' },
  { name: 'part_prefer.list',        desc: 'Full 부분 기분析 사전' },
  { name: 'post.list',               desc: 'Full 후처리 사전' },
  { name: 'Grammar.diana',           desc: '결합문법사전' },
]

const SDIC_FILES: FileSpec[] = [
  { name: 'ncn.dic',         desc: '일반명사',                          star: true },
  { name: 'ncp.dic',         desc: '서술성 명사',                       star: true },
  { name: 'nq_per.dic',      desc: '인명',                              star: true },
  { name: 'nq_etc.dic',      desc: '고유명사 (기업·학교·관공서 등)',    star: true },
  { name: 'nq_loc.dic',      desc: '지명',                              star: true },
  { name: 'pv.dic',          desc: '동사 어간',                         star: true },
  { name: 'pa.dic',          desc: '형용사 어간',                       star: true },
  { name: 'cotton.dic',      desc: '코튼 전용 명사화 사전',             star: true },
  { name: 'juso.dic',        desc: '주소 (시·구·동·읍·면 등)' },
  { name: 'ncn4.dic',        desc: '4음절 이상 명사' },
  { name: 'j.dic',           desc: '조사' },
  { name: 'e.dic',           desc: '어미' },
  { name: 'cotton_e.dic',    desc: '코튼 전용 어미 사전' },
  { name: 'nbn.dic',         desc: '의존명사' },
  { name: 'nbu.dic',         desc: '단위명사' },
  { name: 'nq_per1.dic',     desc: '인명 — 성' },
  { name: 'nq_per2.dic',     desc: '인명 — 이름' },
  { name: 'one_noun.dic',    desc: '한 글자 명사' },
  { name: 'xp.dic',          desc: '접두사' },
  { name: 'xs.dic',          desc: '접미사' },
  { name: 'xsp.dic',         desc: '동사화 접사' },
  { name: 'ma.dic',          desc: '부사' },
  { name: 'mm.dic',          desc: '관형사' },
  { name: 'i.dic',           desc: '감탄사' },
]

const SPEC_MAP: Record<string, FileSpec[]> = {
  grammar: GRAMMAR_FILES,
  sdic: SDIC_FILES,
}

// fixedDictType에 화이트리스트가 있으면 필터링+정렬, 없으면 원본 반환
function applyFileSpec(files: DictFileInfo[], fixedDictType?: string): Array<DictFileInfo & { spec?: FileSpec }> {
  const specs = fixedDictType ? SPEC_MAP[fixedDictType] : undefined
  if (!specs) return files.map(f => ({ ...f }))
  const fileMap = new Map(files.map(f => [f.name, f]))
  return specs.map(spec => {
    const info = fileMap.get(spec.name)
    if (!info) return { name: spec.name, size: -1, mtime: 0, spec }
    return { ...info, spec }
  })
}

// ─── 파일 목록 캐시 (30초 TTL) ───────────────────────────────────
const _fileListCache = new Map<string, { files: DictFileInfo[]; ts: number }>()
const FILE_LIST_CACHE_TTL = 30_000

interface JianaDictPanelProps {
  workspaceId: string
  domain?: string
  fixedDictType?: string
  onFileSelect: (dictType: string, filename: string, content: string) => void
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

export default function JianaDictPanel({ workspaceId, domain, fixedDictType, onFileSelect }: JianaDictPanelProps) {
  const [dictTypes, setDictTypes] = useState<string[]>([])
  const [selectedType, setSelectedType] = useState<string>(fixedDictType ?? '')
  const [files, setFiles] = useState<DictFileInfo[]>([])
  const [loadingTypes, setLoadingTypes] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [openingFile, setOpeningFile] = useState<string>('')
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // ── 파일 목록 로드 (캐시 적용) ───────────────────────────────
  const loadFilesForType = useCallback(async (type: string, forceRefresh = false) => {
    if (!workspaceId || !type) return
    const cacheKey = `${workspaceId}:${type}`
    const cached = _fileListCache.get(cacheKey)
    if (!forceRefresh && cached && Date.now() - cached.ts < FILE_LIST_CACHE_TTL) {
      setFiles(cached.files)
      return
    }
    setLoadingFiles(true)
    try {
      const res = await 클라이언트.get(`/jiana-dict/${type}/files`, {
        params: { workspace_id: workspaceId, ...(domain ? { domain } : {}) },
      })
      const fileList: DictFileInfo[] = res.data?.files ?? []
      _fileListCache.set(cacheKey, { files: fileList, ts: Date.now() })
      if (mountedRef.current) setFiles(fileList)
    } catch {
      if (mountedRef.current) setFiles([])
    } finally {
      if (mountedRef.current) setLoadingFiles(false)
    }
  }, [workspaceId, domain])

  const loadFiles = useCallback(async () => {
    await loadFilesForType(fixedDictType ?? selectedType, true)
  }, [loadFilesForType, fixedDictType, selectedType])

  // ── 사전 타입 목록 로드 ──────────────────────────────────────
  const loadTypes = useCallback(async () => {
    if (!workspaceId) return
    if (fixedDictType) {
      setSelectedType(fixedDictType)
      await loadFilesForType(fixedDictType)
      return
    }
    setLoadingTypes(true)
    try {
      const res = await 클라이언트.get('/jiana-dict/types', {
        params: { workspace_id: workspaceId, ...(domain ? { domain } : {}) },
      })
      const types: string[] = res.data?.types ?? []
      setDictTypes(types)
      if (types.length > 0 && !selectedType) {
        setSelectedType(types[0])
      }
    } catch {
      setDictTypes([])
    } finally {
      setLoadingTypes(false)
    }
  }, [workspaceId, domain, fixedDictType, loadFilesForType, selectedType])

  useEffect(() => { loadTypes() }, [workspaceId, domain]) // eslint-disable-line
  useEffect(() => {
    if (selectedType && !fixedDictType) loadFilesForType(selectedType)
  }, [selectedType, workspaceId]) // eslint-disable-line

  // ── 파일 열기 ──────────────────────────────────────────────
  const handleOpenFile = useCallback(async (filename: string) => {
    const type = fixedDictType ?? selectedType
    if (!workspaceId || !type) return
    setOpeningFile(filename)
    try {
      const res = await 클라이언트.get(`/jiana-dict/${type}/file/${filename}`, {
        params: { workspace_id: workspaceId, ...(domain ? { domain } : {}) },
      })
      onFileSelect(type, filename, res.data?.content ?? '')
    } catch {
      // 에러는 상위에서 처리
    } finally {
      setOpeningFile('')
    }
  }, [workspaceId, fixedDictType, selectedType, domain, onFileSelect])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  // ── 렌더링 ─────────────────────────────────────────────────
  if (!workspaceId) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 240, gap: 8 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {!fixedDictType && (
          <>
            <Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Jiana 사전</Text>
            <Select
              size="small"
              style={{ flex: 1 }}
              value={selectedType || undefined}
              placeholder="타입 선택"
              loading={loadingTypes}
              onChange={(v) => setSelectedType(v)}
              options={dictTypes.map(t => ({ value: t, label: t }))}
            />
          </>
        )}
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={loadFiles}
          loading={loadingFiles}
          title="새로고침"
          style={fixedDictType ? { marginLeft: 'auto' } : {}}
        />
      </div>

      {/* 파일 목록 — flex:1 은 부모 높이 없을 때 0으로 수렴하므로 maxHeight 명시 */}
      <div style={{ flex: 1, overflow: 'auto', maxHeight: 260 }}>
        {loadingFiles ? (
          <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
        ) : files.length === 0 && !SPEC_MAP[fixedDictType ?? ''] ? (
          <Empty description="파일 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
        ) : (() => {
          const displayFiles = applyFileSpec(files, fixedDictType)
          // 즐겨찾기/일반 구분선 삽입 여부 (sdic만 해당)
          const starCount = displayFiles.filter(f => f.spec?.star).length
          const hasGroup = starCount > 0 && starCount < displayFiles.length
          return (
            <List
              size="small"
              dataSource={displayFiles}
              renderItem={(file, idx) => {
                const missing = file.size < 0
                const isStar = !!file.spec?.star
                const showDivider = hasGroup && idx === starCount
                return (
                  <>
                    {showDivider && (
                      <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0', fontSize: 10, color: '#bbb', paddingTop: 2 }}>
                        기타 사전
                      </div>
                    )}
                    <List.Item
                      style={{ padding: '3px 0', cursor: missing ? 'default' : 'pointer', opacity: missing ? 0.35 : 1 }}
                      onClick={() => !missing && handleOpenFile(file.name)}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', gap: 5 }}>
                        {isStar
                          ? <StarFilled style={{ color: '#faad14', fontSize: 11, marginTop: 2, flexShrink: 0 }} />
                          : <FileTextOutlined style={{ color: '#8c8c8c', fontSize: 11, marginTop: 2, flexShrink: 0 }} />
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            ellipsis={{ tooltip: file.name }}
                            style={{ fontSize: 12, fontWeight: isStar ? 600 : 400, display: 'block' }}
                          >
                            {file.name}
                          </Text>
                          {file.spec?.desc && (
                            <Text style={{ fontSize: 10, color: '#8c8c8c', display: 'block', lineHeight: '14px' }}>
                              {file.spec.desc}
                            </Text>
                          )}
                        </div>
                        <Space size={4} style={{ flexShrink: 0, alignItems: 'center' }}>
                          {!missing && (
                            <Tag style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                              {formatSize(file.size)}
                            </Tag>
                          )}
                          {!missing && (openingFile === file.name ? (
                            <Spin size="small" />
                          ) : (
                            <Button
                              size="small"
                              type="link"
                              icon={<EditOutlined />}
                              style={{ padding: 0, height: 'auto' }}
                            />
                          ))}
                        </Space>
                      </div>
                    </List.Item>
                  </>
                )
              }}
            />
          )
        })()}
      </div>
    </div>
  )
}
