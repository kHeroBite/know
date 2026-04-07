import { useState, useEffect } from 'react'
import {
  Card, Form, Input, InputNumber, Button, Table, Tag,
  Upload, Space, Typography, message, Modal, Divider
} from 'antd'
import {
  UploadOutlined, InboxOutlined, SyncOutlined, DeleteOutlined
} from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd'
import { 지식작업API, 사전API } from '../api/pipeline'
import { useWorkspaceStore } from '../stores/workspaceStore'

const { Title, Text } = Typography
const { Dragger } = Upload

interface 업로드결과 {
  file_id: number
  row_count: number
  removed_count: number
  preview: any[]
}

export default function Knowledge() {
  const { selectedDomain: 선택도메인 } = useWorkspaceStore()
  const [업로드결과, set업로드결과] = useState<업로드결과 | null>(null)
  const [작업목록, set작업목록] = useState<any[]>([])
  const [분배폼] = Form.useForm()
  const [업로딩, set업로딩] = useState(false)
  const [동기화중, set동기화중] = useState(false)
  const [초기화모달, set초기화모달] = useState(false)
  const [초기화중, set초기화중] = useState(false)

  const 작업목록조회 = async () => {
    try {
      const res = await 지식작업API.작업목록()
      set작업목록(res.data?.items || [])
    } catch { /* 무시 */ }
  }

  useEffect(() => { 작업목록조회() }, [])

  const 파일업로드Props: UploadProps = {
    name: 'file',
    multiple: false,
    accept: '.csv,.xlsx,.xls',
    maxCount: 1,
    beforeUpload: (file) => {
      const maxSize = 100 * 1024 * 1024
      if (file.size > maxSize) {
        message.error('파일 크기는 100MB 이하여야 합니다.')
        return Upload.LIST_IGNORE
      }
      return false  // 자동 업로드 방지
    },
    onChange: async (info) => {
      const file = info.fileList[0]?.originFileObj
      if (!file) return
      if (!선택도메인) { message.warning('도메인을 먼저 선택하세요.'); return }

      set업로딩(true)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('domain', 선택도메인)
      try {
        const res = await 지식작업API.파일업로드(formData)
        set업로드결과(res.data)
        message.success('업로드 완료')
      } catch (err: any) {
        message.error(err.response?.data?.detail || '업로드 실패')
      } finally {
        set업로딩(false)
      }
    },
  }

  const 작업분배 = async (values: any) => {
    if (!업로드결과) { message.warning('먼저 파일을 업로드하세요.'); return }
    try {
      await 지식작업API.작업분배({
        assignee: values.assignee,
        row_count: values.row_count,
        file_id: 업로드결과.file_id,
      })
      message.success('작업이 분배되었습니다.')
      분배폼.resetFields()
      작업목록조회()
    } catch (err: any) {
      message.error(err.response?.data?.detail || '분배 실패')
    }
  }

  const 사전동기화 = async () => {
    if (!선택도메인) { message.warning('도메인을 선택하세요.'); return }
    set동기화중(true)
    try {
      await 사전API.동기화(선택도메인)
      message.success(`${선택도메인} 도메인 사전 동기화 완료`)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '동기화 실패')
    } finally {
      set동기화중(false)
    }
  }

  const 사전초기화 = async () => {
    if (!선택도메인) { message.warning('도메인을 선택하세요.'); return }
    set초기화중(true)
    try {
      await 사전API.초기화(선택도메인)
      message.success(`${선택도메인} 도메인 사전 초기화 완료`)
      set초기화모달(false)
    } catch (err: any) {
      message.error(err.response?.data?.detail || '초기화 실패')
    } finally {
      set초기화중(false)
    }
  }

  const 작업컬럼 = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '담당자', dataIndex: 'assignee', key: 'assignee' },
    { title: '도메인', dataIndex: 'domain', key: 'domain' },
    { title: '행 수', dataIndex: 'row_count', key: 'row_count' },
    {
      title: '상태', dataIndex: 'status', key: 'status',
      render: (v: string) => (
        <Tag color={v === 'completed' ? 'success' : v === 'in_progress' ? 'processing' : 'default'}>{v}</Tag>
      ),
    },
    { title: '생성일', dataIndex: 'created_at', key: 'created_at' },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={3}>지식작업 워크플로우</Title>

      {/* 파일 업로드 */}
      <Card title="파일 업로드 (CSV/Excel, 최대 100MB)">
        <Dragger {...파일업로드Props} disabled={업로딩}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">파일을 드래그하거나 클릭하여 업로드</p>
          <p className="ant-upload-hint">CSV, Excel 파일 지원. 최대 100MB</p>
        </Dragger>

        {업로드결과 && (
          <Card size="small" style={{ marginTop: 16 }} title="정제 결과 미리보기">
            <Space>
              <Text>전체 행: <strong>{업로드결과.row_count}</strong></Text>
              <Text>제거 항목: <strong style={{ color: '#ff4d4f' }}>{업로드결과.removed_count}</strong></Text>
            </Space>
            <Table
              size="small"
              dataSource={업로드결과.preview}
              columns={
                업로드결과.preview[0]
                  ? Object.keys(업로드결과.preview[0]).map(k => ({ title: k, dataIndex: k, key: k, ellipsis: true }))
                  : []
              }
              rowKey={(_, i) => String(i)}
              pagination={false}
              style={{ marginTop: 8 }}
            />
          </Card>
        )}
      </Card>

      {/* 작업 분배 */}
      <Card title="작업 분배">
        <Form form={분배폼} layout="inline" onFinish={작업분배}>
          <Form.Item name="assignee" rules={[{ required: true, message: '담당자 입력' }]}>
            <Input placeholder="담당자명" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="row_count" rules={[{ required: true, message: '행 수 입력' }]}>
            <InputNumber placeholder="할당 행 수" min={1} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" disabled={!업로드결과}>
              분배
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 사전 관리 */}
      <Card title="사전 관리">
        <Space>
          <Button
            icon={<SyncOutlined />}
            loading={동기화중}
            onClick={사전동기화}
            disabled={!선택도메인}
          >
            사전 동기화
          </Button>
          <Button
            danger icon={<DeleteOutlined />}
            onClick={() => set초기화모달(true)}
            disabled={!선택도메인}
          >
            사전 초기화
          </Button>
        </Space>
      </Card>

      {/* 작업 목록 */}
      <Card
        title="작업 목록"
        extra={<Button size="small" onClick={작업목록조회}>새로고침</Button>}
      >
        <Table
          rowKey="id"
          dataSource={작업목록}
          columns={작업컬럼}
          size="small"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 초기화 확인 모달 */}
      <Modal
        title="사전 초기화 확인"
        open={초기화모달}
        onOk={사전초기화}
        onCancel={() => set초기화모달(false)}
        okText="초기화"
        okButtonProps={{ danger: true, loading: 초기화중 }}
        cancelText="취소"
      >
        <p>
          <strong>{선택도메인}</strong> 도메인의 사전을 초기화하면 모든 등록 데이터가 삭제됩니다.
          정말 진행하시겠습니까?
        </p>
      </Modal>
    </Space>
  )
}
