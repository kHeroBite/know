import { useState, useEffect, useCallback } from 'react'
import {
  Button, Input, Select, Space, Popconfirm, message,
  Modal, Form, Row, Col, Card, Tag, Typography,
} from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, WarningOutlined } from '@ant-design/icons'
import PageHeader from '../components/PageHeader'
import { listSites, createSite, updateSite, deleteSite, type Site, type SiteInput } from '../api/site'
import { workspaceAPI } from '../api/workspace'

const { Text } = Typography

function fmt날짜(dt?: string | null): string | null {
  if (!dt) return null
  try {
    const d = new Date(dt)
    if (isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${hh}:${mm}`
  } catch {
    return null
  }
}

interface DomainOption {
  id: string
  name: string | null
}

export default function SiteManage() {
  const [사이트목록, set사이트목록] = useState<Site[]>([])
  const [도메인목록, set도메인목록] = useState<DomainOption[]>([])
  const [로딩, set로딩] = useState(false)
  const [모달열림, set모달열림] = useState(false)
  const [저장중, set저장중] = useState(false)
  const [편집대상, set편집대상] = useState<Site | null>(null)
  const [form] = Form.useForm<SiteInput>()

  const 사이트조회 = useCallback(async () => {
    set로딩(true)
    try {
      const list = await listSites()
      set사이트목록(list)
    } catch (err: any) {
      message.error('사이트 목록 조회 실패: ' + (err?.response?.data?.detail || '오류'))
    } finally {
      set로딩(false)
    }
  }, [])

  const 도메인조회 = useCallback(async () => {
    try {
      const res = await workspaceAPI.도메인목록()
      set도메인목록(res.data || [])
    } catch {
      message.error('도메인 목록 조회 실패')
    }
  }, [])

  useEffect(() => {
    사이트조회()
    도메인조회()
  }, [사이트조회, 도메인조회])

  const 추가모달열기 = () => {
    set편집대상(null)
    form.resetFields()
    set모달열림(true)
  }

  const 수정모달열기 = (record: Site) => {
    set편집대상(record)
    form.setFieldsValue({
      site_code: record.site_code,
      name: record.name,
      domain_code: record.domain_code,
      description: record.description ?? '',
    })
    set모달열림(true)
  }

  const 저장 = async () => {
    try {
      const values = await form.validateFields()
      set저장중(true)
      if (편집대상) {
        await updateSite(편집대상.id, values)
        message.success('수정 완료')
      } else {
        await createSite(values)
        message.success('추가 완료')
      }
      set모달열림(false)
      form.resetFields()
      set편집대상(null)
      사이트조회()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('저장 실패: ' + (err?.response?.data?.detail || '오류'))
    } finally {
      set저장중(false)
    }
  }

  const 삭제 = async (record: Site) => {
    try {
      await deleteSite(record.id)
      message.success('삭제 완료')
      사이트조회()
    } catch (err: any) {
      message.error('삭제 실패: ' + (err?.response?.data?.detail || '오류'))
    }
  }

  const 도메인표시 = (code: string) => {
    const found = 도메인목록.find(d => d.id === code)
    if (!found) return code
    return found.name ? `${code} (${found.name})` : code
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <PageHeader title="사이트 관리" />
      <div style={{ padding: '0 16px 16px', flex: 1, overflowY: 'auto' }}>
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={추가모달열기} loading={로딩}>
            사이트 추가
          </Button>
        </Space>

        <Row gutter={[16, 16]}>
          {사이트목록.map(site => (
            <Col xs={24} sm={12} key={site.id}>
              <Card
                style={{
                  borderColor: site.orphaned ? '#d9d9d9' : '#1677ff',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  background: site.orphaned ? '#f5f5f5' : undefined,
                }}
                styles={{ body: { padding: 16 } }}
              >
                {/* 카드 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <Text strong style={{ fontSize: 15 }}>{site.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}> ({site.site_code})</Text>
                  </div>
                  {site.orphaned && (
                    <Tag icon={<WarningOutlined />} color="orange">연결 끊김</Tag>
                  )}
                </div>

                {/* 도메인 정보 */}
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    도메인: {도메인표시(site.domain_code)}
                  </Text>
                  {site.description && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{site.description}</Text>
                    </div>
                  )}
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      최근 작업: {fmt날짜(site.last_work_at) ?? '없음'}
                    </Text>
                  </div>
                </div>

                {/* 버튼 */}
                <Space size={6}>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => 수정모달열기(site)}
                  >
                    편집
                  </Button>
                  <Popconfirm
                    title="삭제하시겠습니까?"
                    onConfirm={() => 삭제(site)}
                    okText="삭제"
                    cancelText="취소"
                  >
                    <Button size="small" icon={<DeleteOutlined />} danger>
                      삭제
                    </Button>
                  </Popconfirm>
                </Space>
              </Card>
            </Col>
          ))}
          {사이트목록.length === 0 && !로딩 && (
            <Col span={24}>
              <Card>
                <Text type="secondary">사이트가 없습니다</Text>
              </Card>
            </Col>
          )}
        </Row>
      </div>

      <Modal
        title={편집대상 ? '사이트 수정' : '사이트 추가'}
        open={모달열림}
        onOk={저장}
        onCancel={() => {
          set모달열림(false)
          form.resetFields()
          set편집대상(null)
        }}
        confirmLoading={저장중}
        okText={편집대상 ? '수정' : '추가'}
        cancelText="취소"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="site_code"
            label="사이트 ID (영문)"
            rules={[
              { required: true, message: '사이트 ID를 입력하세요' },
              { pattern: /^[A-Za-z0-9_-]+$/, message: '영문, 숫자, _, - 만 허용됩니다' },
            ]}
          >
            <Input placeholder="예: MAIN_SITE" />
          </Form.Item>
          <Form.Item
            name="name"
            label="사이트명"
            rules={[{ required: true, message: '사이트명을 입력하세요' }]}
          >
            <Input placeholder="예: 메인 사이트" />
          </Form.Item>
          <Form.Item
            name="domain_code"
            label="도메인"
            rules={[{ required: true, message: '도메인을 선택하세요' }]}
          >
            <Select
              placeholder="도메인 선택"
              showSearch
              optionFilterProp="label"
              options={도메인목록.map(d => ({
                value: d.id,
                label: d.name ? `${d.id} (${d.name})` : d.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={3} placeholder="설명 (선택)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
