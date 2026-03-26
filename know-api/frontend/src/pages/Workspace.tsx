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
} from 'antd'
import {
  PlusOutlined,
  LinkOutlined,
  DisconnectOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { workspaceAPI } from '../api/workspace'
import { useAuthStore } from '../stores/authStore'
import { useWorkspaceStore } from '../stores/workspaceStore'

const { Title, Text } = Typography

interface 워크스페이스항목 {
  name: string
  status: 'IDLE' | 'USED'
  domain: string | null
}

export default function Workspace() {
  const { user: currentUser } = useAuthStore()
  const { selectedWorkspace, setWorkspace } = useWorkspaceStore()
  const [목록, set목록] = useState<워크스페이스항목[]>([])
  const [도메인목록, set도메인목록] = useState<string[]>([])
  const [로딩, set로딩] = useState(false)
  const [새이름, set새이름] = useState('')
  const [생성로딩, set생성로딩] = useState(false)
  const [연결팝업WS, set연결팝업WS] = useState<string | null>(null)
  const [선택도메인, set선택도메인] = useState<string | null>(null)
  const [복사진행중, set복사진행중] = useState<Record<string, number>>({})
  const 폴링ref = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  const isSuper = currentUser?.user_id === 'super'

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const [wsRes, dmRes] = await Promise.all([
        workspaceAPI.워크스페이스목록(),
        workspaceAPI.도메인목록(),
      ])
      set목록(wsRes.data)
      set도메인목록(dmRes.data)
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

  const 폴링시작 = (wsName: string) => {
    if (폴링ref.current[wsName]) return
    폴링ref.current[wsName] = setInterval(async () => {
      try {
        const res = await workspaceAPI.진행률조회(wsName)
        const percent: number = res.data?.percent ?? 0
        set복사진행중(prev => ({ ...prev, [wsName]: percent }))
        if (percent >= 100) {
          clearInterval(폴링ref.current[wsName])
          delete 폴링ref.current[wsName]
          set복사진행중(prev => {
            const next = { ...prev }
            delete next[wsName]
            return next
          })
          await 목록조회()
        }
      } catch {
        // 폴링 오류 무시
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
      await workspaceAPI.워크스페이스생성(새이름.trim())
      message.success(`워크스페이스 "${새이름}" 생성 완료`)
      set새이름('')
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
      await workspaceAPI.도메인연결(wsName, 선택도메인)
      message.success(`"${wsName}"에 도메인 "${선택도메인}" 연결 완료`)
      set연결팝업WS(null)
      set선택도메인(null)
      폴링시작(wsName)
      await 목록조회()
    } catch (err: any) {
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

  const getCardStyle = (ws: 워크스페이스항목): React.CSSProperties => {
    const isSelected = selectedWorkspace === ws.name
    if (isSelected) {
      return {
        border: '2px solid #52c41a',
        boxShadow: '0 0 14px rgba(82, 196, 26, 0.35)',
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
        </Card>
      )}

      <Spin spinning={로딩}>
        <Row gutter={[16, 16]}>
          {목록.map(ws => {
            const isSelected = selectedWorkspace === ws.name
            const progressPercent = 복사진행중[ws.name]
            const isInProgress = progressPercent !== undefined

            return (
              <Col xs={24} sm={12} lg={8} key={ws.name}>
                <Card style={getCardStyle(ws)} styles={{ body: { padding: 16 } }}>
                  {/* 복사 진행률 오버레이 */}
                  {isInProgress && (
                    <div style={{ marginBottom: 10 }}>
                      <Progress
                        percent={progressPercent}
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
                    <Text strong style={{ fontSize: 15 }}>
                      {ws.name}
                    </Text>
                    {isSelected ? (
                      <Badge
                        status="success"
                        text={<Text style={{ color: '#52c41a', fontSize: 12 }}>선택됨</Text>}
                      />
                    ) : ws.status === 'USED' ? (
                      <Badge status="processing" text={<Text style={{ fontSize: 12 }}>USED</Text>} />
                    ) : (
                      <Badge status="default" text={<Text style={{ color: '#999', fontSize: 12 }}>IDLE</Text>} />
                    )}
                  </div>

                  {/* 도메인 정보 */}
                  <div style={{ marginBottom: 14, minHeight: 22 }}>
                    {ws.domain ? (
                      <Badge color="blue" text={<Text style={{ fontSize: 13 }}>{ws.domain}</Text>} />
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        연결된 도메인 없음
                      </Text>
                    )}
                  </div>

                  {/* 버튼 영역 */}
                  <Space size={6} wrap>
                    {ws.status === 'IDLE' && (
                      <>
                        <Button
                          type="primary"
                          size="small"
                          icon={<LinkOutlined />}
                          disabled={isInProgress}
                          onClick={() => {
                            set연결팝업WS(ws.name)
                            set선택도메인(null)
                          }}
                        >
                          연결
                        </Button>
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
                          onClick={() => ws.domain && setWorkspace(ws.name, ws.domain)}
                        >
                          {isSelected ? '선택됨' : '선택'}
                        </Button>
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
