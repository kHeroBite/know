import React, { useState, useEffect, useCallback } from 'react'
import { Select, List, Spin, Button, Typography, Space, Empty, Tag } from 'antd'
import { FileTextOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons'
import 클라이언트 from '../../api/client'

const { Text } = Typography

// ─── 타입 ────────────────────────────────────────────────────────

interface DictFileInfo {
  name: string
  size: number
  mtime: number
}

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

  // ── 사전 타입 목록 로드 ──────────────────────────────────────
  const loadTypes = useCallback(async () => {
    if (!workspaceId) return
    if (fixedDictType) {
      setSelectedType(fixedDictType)
      return
    }
    setLoadingTypes(true)
    try {
      const res = await 클라이언트.get('/api/jiana-dict/types', {
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
  }, [workspaceId, domain, fixedDictType, selectedType])

  // ── 파일 목록 로드 ──────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!workspaceId || !selectedType) return
    setLoadingFiles(true)
    try {
      const res = await 클라이언트.get(`/api/jiana-dict/${selectedType}/files`, {
        params: { workspace_id: workspaceId, ...(domain ? { domain } : {}) },
      })
      setFiles(res.data?.files ?? [])
    } catch {
      setFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }, [workspaceId, selectedType, domain])

  useEffect(() => { loadTypes() }, [workspaceId, domain]) // eslint-disable-line
  useEffect(() => { if (selectedType) loadFiles() }, [selectedType, workspaceId]) // eslint-disable-line

  // ── 파일 열기 ──────────────────────────────────────────────
  const handleOpenFile = useCallback(async (filename: string) => {
    if (!workspaceId || !selectedType) return
    setOpeningFile(filename)
    try {
      const res = await 클라이언트.get(`/api/jiana-dict/${selectedType}/file/${filename}`, {
        params: { workspace_id: workspaceId, ...(domain ? { domain } : {}) },
      })
      onFileSelect(selectedType, filename, res.data?.content ?? '')
    } catch {
      // 에러는 상위에서 처리
    } finally {
      setOpeningFile('')
    }
  }, [workspaceId, selectedType, domain, onFileSelect])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  // ── 렌더링 ─────────────────────────────────────────────────
  if (!workspaceId) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
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

      {/* 파일 목록 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loadingFiles ? (
          <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
        ) : files.length === 0 ? (
          <Empty description="파일 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '8px 0' }} />
        ) : (
          <List
            size="small"
            dataSource={files}
            renderItem={(file) => (
              <List.Item
                style={{ padding: '4px 0', cursor: 'pointer' }}
                onClick={() => handleOpenFile(file.name)}
              >
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 6 }}>
                  <FileTextOutlined style={{ color: '#8c8c8c', flexShrink: 0 }} />
                  <Text
                    ellipsis={{ tooltip: file.name }}
                    style={{ flex: 1, fontSize: 12 }}
                  >
                    {file.name}
                  </Text>
                  <Space size={4}>
                    <Tag style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                      {formatSize(file.size)}
                    </Tag>
                    {openingFile === file.name ? (
                      <Spin size="small" />
                    ) : (
                      <Button
                        size="small"
                        type="link"
                        icon={<EditOutlined />}
                        style={{ padding: 0, height: 'auto' }}
                      />
                    )}
                  </Space>
                </div>
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  )
}
