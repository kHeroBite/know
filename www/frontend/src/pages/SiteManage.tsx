import { useState, useEffect, useCallback } from 'react'
import {
  Button, Input, Select, Space, Popconfirm, message,
  Modal, Form, Table,
} from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import PageHeader from '../components/PageHeader'
import { listSites, createSite, updateSite, deleteSite, type Site, type SiteInput } from '../api/site'
import { workspaceAPI } from '../api/workspace'

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

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '사이트 ID', dataIndex: 'site_code', key: 'site_code', width: 160, ellipsis: true },
    { title: '사이트명', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: '도메인',
      dataIndex: 'domain_code',
      key: 'domain_code',
      width: 220,
      render: (code: string) => 도메인표시(code),
    },
    { title: '설명', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '생성일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (v: string) => v || '-',
    },
    {
      title: '',
      key: 'action',
      width: 100,
      render: (_: unknown, record: Site) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<EditOutlined />}
            type="text"
            onClick={() => 수정모달열기(record)}
          />
          <Popconfirm
            title="삭제하시겠습니까?"
            onConfirm={() => 삭제(record)}
            okText="삭제"
            cancelText="취소"
          >
            <Button size="small" icon={<DeleteOutlined />} danger type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <PageHeader title="사이트 관리" />
      <div style={{ padding: '0 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={추가모달열기}>
            사이트 추가
          </Button>
        </Space>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={사이트목록}
            loading={로딩}
            pagination={false}
            size="middle"
          />
        </div>
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
