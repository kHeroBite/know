import { useState, useEffect, useRef } from 'react'
import {
  Typography,
  Button,
  Input,
  Select,
  Space,
  Popconfirm,
  message,
  Badge,
  Card,
  Row,
  Col,
  Progress,
  Modal,
  Empty,
  Spin,
  ColorPicker,
} from 'antd'
import {
  PlusOutlined,
  LinkOutlined,
  DisconnectOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  BgColorsOutlined,
  EditOutlined,
  FolderOutlined,
} from '@ant-design/icons'
import { workspaceAPI } from '../api/workspace'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'

const { Title, Text } = Typography

const 프리셋색상 = [
  '#0f1c3f', '#1a1a2e', '#1a2744', '#1e3a5f',
  '#134e4a', '#14532d', '#4c1d95', '#7f1d1d',
  '#7c2d12', '#1e293b', '#312e81', '#164e63',
]

interface 워크스페이스항목 {
  name: string
  status: 'IDLE' | 'USED' | 'CONNECTING' | 'FAILED'
  domain: string | null
  connected_by: string | null
  color: string | null
}

export default function Workspace() {
  const { user: currentUser } = useAuthStore()
  const { selectedWorkspace, setWorkspace, clearWorkspace } = useWorkspaceStore()
  const [목록, set목록] = useState<워크스페이스항목[]>([])
  const [도메인목록, set도메인목록] = useState<string[]>([])
  const [로딩, set로딩] = useState(false)
  const [새이름, set새이름] = useState('')
  const [새색상, set새색상] = useState<string | null>(null)
  const [생성로딩, set생성로딩] = useState(false)
  const [연결팝업WS, set연결팝업WS] = useState<string | null>(null)
  const [선택도메인, set선택도메인] = useState<string | null>(null)
  const [복사진행중, set복사진행중] = useState<Record<string, number>>({})
  const [색상팝업WS, set색상팝업WS] = useState<string | null>(null)
  const 폴링ref = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  const isSuper = currentUser?.auth === 'A'

  // 도메인 관리 상태
  const [도메인추가팝업, set도메인추가팝업] = useState(false)
  const [도메인신규이름, set도메인신규이름] = useState('')
  const [도메인소스타입, set도메인소스타입] = useState<'domain' | 'old'>('domain')
  const [도메인소스이름, set도메인소스이름] = useState<string | null>(null)
  const [old소스목록, setOld소스목록] = useState<string[]>([])
  const [도메인추가로딩, set도메인추가로딩] = useState(false)
  const [도메인복사진행중, set도메인복사진행중] = useState<Record<string, number>>({})
  const 도메인폴링ref = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const [이름변경대상, set이름변경대상] = useState<string | null>(null)
  const [변경후이름, set변경후이름] = useState('')

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const [wsRes, dmRes] = await Promise.all([
        workspaceAPI.워크스페이스목록(),
        workspaceAPI.도메인목록(),
      ])
      const wsList: 워크스페이스항목[] = wsRes.data
      set목록(wsList)
      set도메인목록(dmRes.data)
      // CONNECTING 상태 워크스페이스 자동 폴링
      wsList.forEach(ws => {
        if (ws.status === 'CONNECTING' && !폴링ref.current[ws.name]) {
          폴링시작(ws.name)
        }
      })
    } catch {
      message.error('목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  useEffect(() => {
    목록조회()
    return () => {
      Object.values(폴링ref.current).forEach(clearInterval)
    }
  }, [])

  const 폴링종료 = async (wsName: string) => {
    clearInterval(폴링ref.current[wsName])
    delete 폴링ref.current[wsName]
    set복사진행중(prev => {
      const next = { ...prev }
      delete next[wsName]
      return next
    })
    await 목록조회()
  }

  const 폴링시작 = (wsName: string) => {
    if (폴링ref.current[wsName]) return
    폴링ref.current[wsName] = setInterval(async () => {
      try {
        const res = await workspaceAPI.진행률조회(wsName)
        const st = res.data?.status
        if (st === 'done') {
          const elapsed = res.data?.elapsed
          const fileCount = res.data?.file_count
          const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}분 ${Math.round(elapsed % 60)}초` : `${elapsed}초`
          message.success(`연결 완료 — ${fileCount ?? 0}개 파일, ${timeStr}`)
          await 폴링종료(wsName)
          return
        }
        if (st === 'idle' || st === 'error') {
          if (st === 'error') message.error(`연결 실패: ${res.data?.message || '알 수 없는 오류'}`)
          await 폴링종료(wsName)
          return
        }
        const percent: number = res.data?.percent ?? 0
        set복사진행중(prev => ({ ...prev, [wsName]: percent }))
        if (percent >= 100) {
          await 폴링종료(wsName)
        }
      } catch {
        await 폴링종료(wsName)
      }
    }, 2000)
  }

  const 생성핸들러 = async () => {
    if (!새이름.trim()) {
      message.warning('이름을 입력하세요')
      return
    }
    set생성로딩(true)
    try {
      await workspaceAPI.워크스페이스생성(새이름.trim(), 새색상)
      message.success(`워크스페이스 "${새이름}" 생성 완료`)
      set새이름('')
      set새색상(null)
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '생성 실패')
    } finally {
      set생성로딩(false)
    }
  }

  const 도메인폴링시작 = (dmName: string) => {
    if (도메인폴링ref.current[dmName]) return
    도메인폴링ref.current[dmName] = setInterval(async () => {
      try {
        const res = await workspaceAPI.도메인추가진행률(dmName)
        const st = res.data?.status
        if (!st || st === 'idle') {
          clearInterval(도메인폴링ref.current[dmName])
          delete 도메인폴링ref.current[dmName]
          set도메인복사진행중(prev => { const n = { ...prev }; delete n[dmName]; return n })
          await 목록조회()
          return
        }
        if (st === 'done') {
          const elapsed = res.data?.elapsed
          const fc = res.data?.file_count
          message.success(`도메인 "${dmName}" 추가 완료 — ${fc ?? 0}개 파일, ${elapsed}초`)
          clearInterval(도메인폴링ref.current[dmName])
          delete 도메인폴링ref.current[dmName]
          set도메인복사진행중(prev => { const n = { ...prev }; delete n[dmName]; return n })
          await 목록조회()
          return
        }
        if (st === 'error') {
          message.error(`도메인 추가 실패: ${res.data?.message}`)
          clearInterval(도메인폴링ref.current[dmName])
          delete 도메인폴링ref.current[dmName]
          set도메인복사진행중(prev => { const n = { ...prev }; delete n[dmName]; return n })
          return
        }
        set도메인복사진행중(prev => ({ ...prev, [dmName]: res.data?.percent ?? 0 }))
      } catch {
        clearInterval(도메인폴링ref.current[dmName])
        delete 도메인폴링ref.current[dmName]
        set도메인복사진행중(prev => { const n = { ...prev }; delete n[dmName]; return n })
      }
    }, 1500)
  }

  const 삭제핸들러 = async (name: string) => {
    try {
      await workspaceAPI.워크스페이스삭제(name)
      message.success(`워크스페이스 "${name}" 삭제 완료`)
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '삭제 실패')
    }
  }

  const 연결확인핸들러 = async () => {
    if (!연결팝업WS || !선택도메인) {
      message.warning('도메인을 선택하세요')
      return
    }
    const wsName = 연결팝업WS
    try {
      // 즉시 UI에 진행률 0% 표시 (서버 응답 전)
      set복사진행중(prev => ({ ...prev, [wsName]: 0 }))
      set연결팝업WS(null)
      set선택도메인(null)
      await workspaceAPI.도메인연결(wsName, 선택도메인)
      message.success(`"${wsName}" 도메인 연결 시작`)
      폴링시작(wsName)
      await 목록조회()
    } catch (err: any) {
      // 실패 시 progress 제거
      set복사진행중(prev => {
        const next = { ...prev }
        delete next[wsName]
        return next
      })
      message.error(err.response?.data?.detail || '연결 실패')
    }
  }

  const 해제핸들러 = async (wsName: string) => {
    try {
      await workspaceAPI.워크스페이스해제(wsName)
      // 선택된 워크스페이스를 연결해제하면 선택도 해제 + 테마 초기화
      if (selectedWorkspace === wsName) {
        clearWorkspace()
      }
      message.success(`"${wsName}" 연결해제 완료`)
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '연결해제 실패')
    }
  }

  const 선택해제핸들러 = () => {
    clearWorkspace()
    message.success('워크스페이스 선택 해제')
  }

  const 색상변경핸들러 = async (wsName: string, color: string) => {
    try {
      await workspaceAPI.색상변경(wsName, color)
      set색상팝업WS(null)
      if (selectedWorkspace === wsName) {
        const ws = 목록.find(w => w.name === wsName)
        if (ws?.domain) setWorkspace(wsName, ws.domain, color)
      }
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '색상 변경 실패')
    }
  }

  const getCardStyle = (ws: 워크스페이스항목): React.CSSProperties => {
    const isSelected = selectedWorkspace === ws.name
    const themeColor = ws.color
    if (isSelected) {
      const bg = themeColor || '#1a1a2e'
      return {
        border: `2px solid ${bg}`,
        background: bg,
        color: '#fff',
        boxShadow: `0 0 14px ${bg}88`,
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    if (ws.status === 'FAILED') {
      return {
        border: '1px solid #ff4d4f',
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    if (ws.status === 'CONNECTING') {
      return {
        border: `1px solid ${themeColor || '#faad14'}`,
        boxShadow: '0 0 8px rgba(250, 173, 20, 0.3)',
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    if (themeColor) {
      return {
        border: ws.status === 'USED' ? `1px solid ${themeColor}` : `1px dashed ${themeColor}`,
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    if (ws.status === 'USED') {
      return {
        border: '1px solid #1677ff',
        transition: 'all 0.3s ease',
        animation: 'wsCardFadeIn 0.4s ease',
      }
    }
    return {
      border: '1px dashed #d9d9d9',
      transition: 'all 0.3s ease',
      animation: 'wsCardFadeIn 0.4s ease',
    }
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <style>{`
        @keyframes wsCardFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <Title level={3}>워크스페이스</Title>

      {isSuper && (
        <Card style={{ marginBottom: 16, animation: 'wsCardFadeIn 0.3s ease' }}>
          <Space direction="vertical" size={10}>
            <Space>
              <Input
                placeholder="워크스페이스 이름"
                value={새이름}
                onChange={e => set새이름(e.target.value)}
                onPressEnter={생성핸들러}
                style={{ width: 200 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={생성핸들러}
                loading={생성로딩}
              >
                생성
              </Button>
            </Space>
            {/* 색상 선택 (생성 시) — ColorPicker */}
            <Space size={8} align="center">
              <Text type="secondary" style={{ fontSize: 12 }}>색상:</Text>
              <ColorPicker
                value={새색상 || '#1a1a2e'}
                onChange={(color) => set새색상(color.toHexString())}
                presets={[{ label: '추천 색상', colors: 프리셋색상 }]}
                size="small"
              />
              {새색상 && (
                <div style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: 새색상, border: '1px solid #d9d9d9',
                }} />
              )}
            </Space>
          </Space>
        </Card>
      )}

      <Spin spinning={로딩}>
        <Row gutter={[16, 16]}>
          {목록.map(ws => {
            const isSelected = selectedWorkspace === ws.name
            const progressPercent = 복사진행중[ws.name]
            const isInProgress = progressPercent !== undefined || ws.status === 'CONNECTING'

            return (
              <Col xs={24} sm={12} lg={8} key={ws.name}>
                <Card style={getCardStyle(ws)} styles={{ body: { padding: 16 } }}>
                  {/* 복사 진행률 오버레이 */}
                  {isInProgress && (
                    <div style={{ marginBottom: 10 }}>
                      <Progress
                        percent={progressPercent ?? 0}
                        size="small"
                        status="active"
                        format={p => `${p}%`}
                      />
                    </div>
                  )}

                  {/* 카드 헤더 */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {ws.color && (
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: ws.color,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <Text strong style={{ fontSize: 15, color: isSelected ? '#fff' : undefined }}>
                        {ws.name}
                      </Text>
                    </div>
                    {ws.status === 'CONNECTING' ? (
                      <Badge status="warning" text={<Text style={{ color: '#faad14', fontSize: 12 }}>연결중</Text>} />
                    ) : ws.status === 'FAILED' ? (
                      <Badge status="error" text={<Text style={{ color: '#ff4d4f', fontSize: 12 }}>연결실패</Text>} />
                    ) : isSelected ? (
                      <Badge
                        status="success"
                        text={
                          <Text style={{ color: '#fff', fontSize: 12 }}>
                            선택됨
                          </Text>
                        }
                      />
                    ) : ws.status === 'USED' ? (
                      <Badge status="processing" text={<Text style={{ fontSize: 12 }}>연결됨</Text>} />
                    ) : (
                      <Badge status="default" text={<Text style={{ color: '#999', fontSize: 12 }}>유휴</Text>} />
                    )}
                  </div>

                  {/* 도메인 + 연결자 (한 줄) */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                    minHeight: 22,
                  }}>
                    <div>
                      {ws.domain ? (
                        <Badge color={isSelected ? 'white' : 'blue'} text={<Text style={{ fontSize: 13, color: isSelected ? '#fff' : undefined }}>{ws.domain}</Text>} />
                      ) : (
                        <Text type="secondary" style={{ fontSize: 12, color: isSelected ? 'rgba(255,255,255,0.7)' : undefined }}>
                          연결된 도메인 없음
                        </Text>
                      )}
                    </div>
                    {ws.connected_by && (
                      <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, marginLeft: 8, color: isSelected ? 'rgba(255,255,255,0.7)' : undefined }}>
                        연결: {ws.connected_by}
                      </Text>
                    )}
                  </div>

                  {/* 버튼 영역 */}
                  <Space size={6} wrap>
                    {(ws.status === 'IDLE' || ws.status === 'FAILED') && (
                      <>
                        <Button
                          type="primary"
                          size="small"
                          icon={<LinkOutlined />}
                          disabled={isInProgress || 목록.some(w => w.status === 'CONNECTING')}
                          onClick={() => {
                            set연결팝업WS(ws.name)
                            set선택도메인(null)
                          }}
                        >
                          연결
                        </Button>
                        <ColorPicker
                          value={ws.color || '#1a1a2e'}
                          onChangeComplete={(color) => 색상변경핸들러(ws.name, color.toHexString())}
                          presets={[{ label: '추천 색상', colors: 프리셋색상 }]}
                          size="small"
                        >
                          <Button size="small" icon={<BgColorsOutlined />}>
                            색상
                          </Button>
                        </ColorPicker>
                        {isSuper && (
                          <Popconfirm
                            title={`"${ws.name}" 워크스페이스를 삭제하시겠습니까?`}
                            onConfirm={() => 삭제핸들러(ws.name)}
                            okText="삭제"
                            cancelText="취소"
                          >
                            <Button size="small" danger icon={<DeleteOutlined />}>
                              삭제
                            </Button>
                          </Popconfirm>
                        )}
                      </>
                    )}

                    {ws.status === 'USED' && (
                      <>
                        {isSelected ? (
                          <Button
                            size="small"
                            onClick={선택해제핸들러}
                          >
                            선택해제
                          </Button>
                        ) : (
                          <Button
                            type="primary"
                            size="small"
                            disabled={!currentUser}
                            onClick={() => ws.domain && setWorkspace(ws.name, ws.domain, ws.color)}
                          >
                            선택
                          </Button>
                        )}
                        <ColorPicker
                          value={ws.color || '#1a1a2e'}
                          onChangeComplete={(color) => 색상변경핸들러(ws.name, color.toHexString())}
                          presets={[{ label: '추천 색상', colors: 프리셋색상 }]}
                          size="small"
                        >
                          <Button size="small" icon={<BgColorsOutlined />}>
                            색상
                          </Button>
                        </ColorPicker>
                        <Popconfirm
                          title={`"${ws.name}" 도메인 연결을 해제하시겠습니까?`}
                          onConfirm={() => 해제핸들러(ws.name)}
                          okText="연결해제"
                          cancelText="취소"
                        >
                          <Button size="small" icon={<DisconnectOutlined />}>
                            연결해제
                          </Button>
                        </Popconfirm>
                        {isSuper && (
                          <Button size="small" danger icon={<DeleteOutlined />} disabled>
                            삭제
                          </Button>
                        )}
                      </>
                    )}
                  </Space>
                </Card>
              </Col>
            )
          })}

          {목록.length === 0 && !로딩 && (
            <Col span={24}>
              <Card>
                <Empty description="워크스페이스가 없습니다" />
              </Card>
            </Col>
          )}
        </Row>
      </Spin>

      {/* 도메인 연결 모달 */}
      <Modal
        title={`도메인 연결 — ${연결팝업WS}`}
        open={!!연결팝업WS}
        onOk={연결확인핸들러}
        onCancel={() => {
          set연결팝업WS(null)
          set선택도메인(null)
        }}
        okText="연결"
        cancelText="취소"
        okButtonProps={{ disabled: !선택도메인 }}
      >
        <Select
          style={{ width: '100%', marginTop: 8 }}
          placeholder="연결할 도메인 선택"
          options={도메인목록.map(d => {
            const 연결됨WS = 목록.find(ws => ws.domain === d && ws.status === 'USED')
            return {
              label: 연결됨WS ? `${d} (${연결됨WS.name}에 연결됨)` : d,
              value: d,
              disabled: !!연결됨WS,
            }
          })}
          onChange={v => set선택도메인(v)}
          value={선택도메인}
        />
      </Modal>

      {/* 이름 변경 모달 */}
      <Modal
        title={`도메인 이름 변경 — ${이름변경대상}`}
        open={!!이름변경대상}
        onOk={async () => {
          if (!이름변경대상 || !변경후이름.trim()) return
          try {
            await workspaceAPI.도메인이름변경(이름변경대상, 변경후이름.trim())
            message.success('이름 변경 완료')
            set이름변경대상(null)
            set변경후이름('')
            await 목록조회()
          } catch (err: any) {
            message.error(err.response?.data?.detail || '이름 변경 실패')
          }
        }}
        onCancel={() => { set이름변경대상(null); set변경후이름('') }}
        okText="변경"
        cancelText="취소"
        okButtonProps={{ disabled: !변경후이름.trim() }}
      >
        <Input
          placeholder="새 도메인 이름"
          value={변경후이름}
          onChange={e => set변경후이름(e.target.value)}
          style={{ marginTop: 8 }}
        />
      </Modal>

      {/* 도메인 관리 영역 (super 전용) */}
      {isSuper && (
        <Card
          title={<><FolderOutlined /> 도메인 관리</>}
          style={{ marginTop: 24 }}
          extra={
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={async () => {
                set도메인추가팝업(true)
                try { const res = await workspaceAPI.old도메인소스목록(); setOld소스목록(res.data) } catch { /* ignore */ }
              }}
            >
              도메인 추가
            </Button>
          }
        >
          {/* 도메인 복사 진행률 */}
          {Object.entries(도메인복사진행중).map(([dm, pct]) => (
            <div key={dm} style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 12, marginRight: 8 }}>{dm} 복사 중</Text>
              <Progress percent={pct} size="small" status="active" style={{ maxWidth: 300, display: 'inline-block' }} />
            </div>
          ))}

          <Row gutter={[8, 8]}>
            {도메인목록.map(dm => {
              const 연결됨 = 목록.some(ws => ws.domain === dm && (ws.status === 'USED' || ws.status === 'CONNECTING'))
              return (
                <Col key={dm}>
                  <Card size="small" style={{ minWidth: 140 }} styles={{ body: { padding: '8px 12px' } }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <Text strong>{dm}</Text>
                      <Space size={4}>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          disabled={연결됨}
                          onClick={() => { set이름변경대상(dm); set변경후이름(dm) }}
                        />
                        <Popconfirm
                          title={`도메인 "${dm}"을 삭제하시겠습니까?`}
                          onConfirm={async () => {
                            try {
                              await workspaceAPI.도메인삭제(dm)
                              message.success(`도메인 "${dm}" 삭제 완료`)
                              await 목록조회()
                            } catch (err: any) {
                              message.error(err.response?.data?.detail || '삭제 실패')
                            }
                          }}
                          okText="삭제"
                          cancelText="취소"
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} disabled={연결됨} />
                        </Popconfirm>
                      </Space>
                    </div>
                    {연결됨 && <Text type="secondary" style={{ fontSize: 11 }}>연결 중</Text>}
                  </Card>
                </Col>
              )
            })}
            {도메인목록.length === 0 && <Col><Text type="secondary">도메인이 없습니다</Text></Col>}
          </Row>
        </Card>
      )}

      {/* 도메인 추가 모달 */}
      <Modal
        title="도메인 추가"
        open={도메인추가팝업}
        onOk={async () => {
          if (!도메인신규이름.trim() || !도메인소스이름) {
            message.warning('이름과 소스를 모두 입력하세요')
            return
          }
          set도메인추가로딩(true)
          const dmName = 도메인신규이름.trim()
          try {
            await workspaceAPI.도메인추가(dmName, 도메인소스타입, 도메인소스이름)
            message.info(`도메인 "${dmName}" 복사 시작`)
            set도메인추가팝업(false)
            set도메인신규이름('')
            set도메인소스이름(null)
            set도메인복사진행중(prev => ({ ...prev, [dmName]: 0 }))
            도메인폴링시작(dmName)
          } catch (err: any) {
            message.error(err.response?.data?.detail || '추가 실패')
          } finally {
            set도메인추가로딩(false)
          }
        }}
        onCancel={() => { set도메인추가팝업(false); set도메인신규이름(''); set도메인소스이름(null) }}
        okText="추가"
        cancelText="취소"
        confirmLoading={도메인추가로딩}
        okButtonProps={{ disabled: !도메인신규이름.trim() || !도메인소스이름 }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
          <Input
            placeholder="새 도메인 이름"
            value={도메인신규이름}
            onChange={e => set도메인신규이름(e.target.value)}
          />
          <Select
            style={{ width: '100%' }}
            value={도메인소스타입}
            onChange={v => { set도메인소스타입(v); set도메인소스이름(null) }}
            options={[
              { label: '기존 도메인에서 복사', value: 'domain' },
              { label: 'Old 영역에서 복사', value: 'old' },
            ]}
          />
          <Select
            style={{ width: '100%' }}
            placeholder="소스 선택"
            options={(도메인소스타입 === 'old' ? (old소스목록 || []) : 도메인목록).map(d => ({ label: d, value: d }))}
            onChange={v => set도메인소스이름(v)}
            value={도메인소스이름}
          />
        </Space>
      </Modal>
    </div>
  )
}
