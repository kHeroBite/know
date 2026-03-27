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
  const { selectedWorkspace, setWorkspace } = useWorkspaceStore()
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

  const isSuper = currentUser?.user_id === 'super'

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
      message.success(`"${wsName}" 해제 완료`)
      await 목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '해제 실패')
    }
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
      return {
        border: `2px solid ${themeColor || '#52c41a'}`,
        boxShadow: themeColor
          ? `0 0 14px ${themeColor}88`
          : '0 0 14px rgba(82, 196, 26, 0.35)',
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
                      <Text strong style={{ fontSize: 15 }}>
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
                          <Text style={{ color: ws.color || '#52c41a', fontSize: 12 }}>
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
                        <Badge color="blue" text={<Text style={{ fontSize: 13 }}>{ws.domain}</Text>} />
                      ) : (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          연결된 도메인 없음
                        </Text>
                      )}
                    </div>
                    {ws.connected_by && (
                      <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
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
                        <Button
                          type={isSelected ? 'default' : 'primary'}
                          size="small"
                          icon={isSelected ? <CheckCircleOutlined /> : undefined}
                          disabled={!currentUser || isSelected}
                          onClick={() => ws.domain && setWorkspace(ws.name, ws.domain, ws.color)}
                        >
                          {isSelected ? '선택됨' : '선택'}
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
                        <Popconfirm
                          title={`"${ws.name}" 워크스페이스를 해제하시겠습니까?`}
                          onConfirm={() => 해제핸들러(ws.name)}
                          okText="해제"
                          cancelText="취소"
                        >
                          <Button size="small" icon={<DisconnectOutlined />}>
                            해제
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
          options={도메인목록.map(d => ({ label: d, value: d }))}
          onChange={v => set선택도메인(v)}
          value={선택도메인}
        />
      </Modal>
    </div>
  )
}
