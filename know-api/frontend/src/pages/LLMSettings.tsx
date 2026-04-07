import { useState, useEffect } from 'react'
import PageHeader from '../components/PageHeader'
import { Card, Input, Button, Select, Switch, message, Spin, Typography, Space, Tag, Row, Col } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, ApiOutlined, ReloadOutlined } from '@ant-design/icons'
import { llmAPI, type LLM설정 } from '../api/llm'

const { Text, Title } = Typography

const 프로바이더정보: Record<string, { 이름: string; 색상: string; 설명: string; 키필요: boolean }> = {
  openai: { 이름: 'ChatGPT (OpenAI)', 색상: '#10a37f', 설명: 'GPT-4o, GPT-4o-mini 등', 키필요: true },
  claude: { 이름: 'Claude (Anthropic)', 색상: '#d97706', 설명: 'Claude Opus, Sonnet, Haiku', 키필요: true },
  gemini: { 이름: 'Gemini (Google)', 색상: '#4285f4', 설명: 'Gemini 2.0 Flash, Pro 등', 키필요: true },
  local: { 이름: 'Local LLM (Ollama)', 색상: '#6b7280', 설명: 'Llama, Mistral 등 로컬 모델', 키필요: false },
}

interface 프로바이더상태 {
  api_key: string
  base_url: string
  model: string
  models: string[]
  테스트중: boolean
  모델로딩중: boolean
  테스트통과: boolean
  테스트결과: string
  is_active: boolean
}

export default function LLMSettings() {
  const [로딩중, set로딩중] = useState(true)
  const [저장중, set저장중] = useState<string | null>(null)
  const [활성변경중, set활성변경중] = useState<string | null>(null)
  const [상태맵, set상태맵] = useState<Record<string, 프로바이더상태>>({})
  const [원본키맵, set원본키맵] = useState<Record<string, string>>({})

  const 설정로드 = async () => {
    set로딩중(true)
    try {
      const { data } = await llmAPI.설정조회()
      const 새상태: Record<string, 프로바이더상태> = {}
      const 키맵: Record<string, string> = {}
      for (const s of data) {
        새상태[s.provider] = {
          api_key: s.api_key,
          base_url: s.base_url,
          model: s.model,
          models: [],
          테스트중: false,
          모델로딩중: false,
          테스트통과: s.test_passed === 1,
          테스트결과: '',
          is_active: s.is_active === 1,
        }
        키맵[s.provider] = s.api_key
      }
      set상태맵(새상태)
      set원본키맵(키맵)
    } catch {
      message.error('LLM 설정 로드 실패')
    } finally {
      set로딩중(false)
    }
  }

  useEffect(() => { 설정로드() }, [])

  const 상태업데이트 = (provider: string, patch: Partial<프로바이더상태>) => {
    set상태맵(prev => ({ ...prev, [provider]: { ...prev[provider], ...patch } }))
  }

  const 실제키값 = (provider: string): string => {
    const 현재 = 상태맵[provider]?.api_key || ''
    if (현재.includes('*')) return 원본키맵[provider] || 현재
    return 현재
  }

  const 연결테스트 = async (provider: string) => {
    상태업데이트(provider, { 테스트중: true, 테스트결과: '' })
    try {
      const key = 실제키값(provider)
      const { data } = await llmAPI.통신테스트(provider, {
        api_key: key,
        base_url: 상태맵[provider]?.base_url || '',
      })
      if (data.success) {
        message.success(data.message)
        상태업데이트(provider, { 테스트통과: true, 테스트결과: `✅ ${data.message}` })
        모델목록로드(provider)
      } else {
        message.error(data.message)
        상태업데이트(provider, { 테스트통과: false, 테스트결과: `❌ ${data.message}` })
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : '연결 테스트 실패'
      message.error(msg)
      상태업데이트(provider, { 테스트통과: false, 테스트결과: `❌ ${msg}` })
    } finally {
      상태업데이트(provider, { 테스트중: false })
    }
  }

  const 모델목록로드 = async (provider: string) => {
    상태업데이트(provider, { 모델로딩중: true })
    try {
      const key = 실제키값(provider)
      const { data } = await llmAPI.모델목록(
        provider, key, 상태맵[provider]?.base_url || ''
      )
      상태업데이트(provider, { models: data.models || [] })
    } catch {
      message.error('모델 목록 조회 실패')
    } finally {
      상태업데이트(provider, { 모델로딩중: false })
    }
  }

  const 설정저장 = async (provider: string) => {
    set저장중(provider)
    try {
      const s = 상태맵[provider]
      const key = 실제키값(provider)
      await llmAPI.설정저장(provider, {
        api_key: key,
        base_url: s.base_url,
        model: s.model,
        is_active: s.is_active ? 1 : 0,
      })
      message.success(`${프로바이더정보[provider]?.이름 || provider} 설정 저장 완료`)
      설정로드()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '설정 저장 실패')
    } finally {
      set저장중(null)
    }
  }

  const 활성토글 = async (provider: string, checked: boolean) => {
    set활성변경중(provider)
    try {
      await llmAPI.활성변경(provider)
      상태업데이트(provider, { is_active: checked })
      message.success(`${프로바이더정보[provider]?.이름 || provider} ${checked ? '활성화' : '비활성화'}`)
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '활성화 변경 실패')
    } finally {
      set활성변경중(null)
    }
  }

  const 카드렌더링 = (provider: string) => {
    const info = 프로바이더정보[provider]
    const s = 상태맵[provider]
    if (!s || !info) return null
    const 활성 = s.is_active
    return (
      <Col xs={24} lg={12} key={provider}>
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space>
                <span style={{ color: info.색상, fontWeight: 600 }}>{info.이름}</span>
                {활성 && <Tag color="green">활성</Tag>}
                {s.테스트통과 ? (
                  <Tag icon={<CheckCircleOutlined />} color="success">연결됨</Tag>
                ) : (
                  <Tag icon={<CloseCircleOutlined />} color="default">미연결</Tag>
                )}
              </Space>
              <Switch
                checked={활성}
                loading={활성변경중 === provider}
                onChange={(checked) => 활성토글(provider, checked)}
                checkedChildren="활성"
                unCheckedChildren="비활성"
                disabled={!s.테스트통과}
              />
            </div>
          }
          size="small"
          style={{ borderColor: 활성 ? info.색상 : undefined, borderWidth: 활성 ? 2 : 1 }}
        >
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            {info.설명}
          </Text>

          {info.키필요 && (
            <div style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12 }}>API Key</Text>
              <Input.Password
                size="small"
                value={s.api_key}
                onChange={e => 상태업데이트(provider, { api_key: e.target.value })}
                placeholder="API 키 입력"
              />
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12 }}>Base URL (선택)</Text>
            <Input
              size="small"
              value={s.base_url}
              onChange={e => 상태업데이트(provider, { base_url: e.target.value })}
              placeholder={provider === 'local' ? 'http://localhost:11434' : '기본값 사용'}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <Space>
              <Button
                size="small"
                type="primary"
                icon={<ApiOutlined />}
                loading={s.테스트중}
                onClick={() => 연결테스트(provider)}
              >
                연결 테스트
              </Button>
              {provider !== 'local' && s.테스트통과 && (
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={s.모델로딩중}
                  onClick={() => 모델목록로드(provider)}
                >
                  모델 새로고침
                </Button>
              )}
            </Space>
            {s.테스트결과 && (
              <div style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: s.테스트통과 ? '#52c41a' : '#ff4d4f' }}>
                  {s.테스트결과}
                </Text>
              </div>
            )}
          </div>

          {provider !== 'local' && (
            <div style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12 }}>모델 선택</Text>
              <Select
                size="small"
                style={{ width: '100%' }}
                value={s.model || undefined}
                onChange={val => 상태업데이트(provider, { model: val })}
                placeholder={s.models.length ? '모델 선택' : '먼저 연결 테스트 필요'}
                disabled={!s.테스트통과 && s.models.length === 0}
                showSearch
                options={s.models.map(m => ({ label: m, value: m }))}
                loading={s.모델로딩중}
              />
            </div>
          )}

          <Button
            type="primary"
            size="small"
            block
            loading={저장중 === provider}
            onClick={() => 설정저장(provider)}
          >
            저장
          </Button>
        </Card>
      </Col>
    )
  }

  if (로딩중) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="LLM 설정 로드 중..." />
      </div>
    )
  }

  const 활성수 = Object.values(상태맵).filter(s => s.is_active).length

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader title="LLM 설정" />
      <div style={{ marginBottom: 24 }}>
        <Text type="secondary">AI 분석에 사용할 LLM 프로바이더를 설정합니다. 여러 개 동시 활성화 시 모든 결과를 비교할 수 있습니다.</Text>
        {활성수 > 0 && (
          <div style={{ marginTop: 8 }}>
            <Tag color="blue">{활성수}개 활성화됨</Tag>
          </div>
        )}
      </div>

      <Title level={5} style={{ marginBottom: 12, color: '#6b7280' }}>로컬LLM</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {['local'].map(provider => 카드렌더링(provider))}
      </Row>

      <Title level={5} style={{ marginBottom: 12, color: '#1677ff' }}>범용LLM</Title>
      <Row gutter={[16, 16]}>
        {['openai', 'claude', 'gemini'].map(provider => 카드렌더링(provider))}
      </Row>
    </div>
  )
}
