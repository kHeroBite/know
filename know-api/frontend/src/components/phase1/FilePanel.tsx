import { useState, useEffect } from 'react'
import { Table, Tabs, Button, Upload, Space, Typography, Popconfirm, message, Tag } from 'antd'
import { InboxOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { phase1API } from '../../api/phase1'

const { Text } = Typography
const { Dragger } = Upload

interface FileItem {
  name: string
  size: number
  mtime: string
}

interface FilePanelProps {
  folder: 'popular' | 'fails'
  onFolderChange: (f: string) => void
  selectedFile: string | null
  onFileSelect: (name: string) => void
}

export default function FilePanel({ folder, onFolderChange, selectedFile, onFileSelect }: FilePanelProps) {
  const [파일목록, set파일목록] = useState<FileItem[]>([])
  const [로딩, set로딩] = useState(false)
  const [업로딩, set업로딩] = useState(false)

  const 목록조회 = async () => {
    set로딩(true)
    try {
      const { data } = await phase1API.파일목록(folder)
      set파일목록(data.files || [])
    } catch {
      message.error('파일 목록 조회 실패')
    } finally {
      set로딩(false)
    }
  }

  useEffect(() => { 목록조회() }, [folder])

  const 삭제핸들러 = async (filename: string) => {
    try {
      await phase1API.파일삭제(folder, filename)
      message.success(`${filename} 삭제 완료`)
      목록조회()
      if (selectedFile === filename) onFileSelect('')
    } catch (err: any) {
      message.error(err.response?.data?.detail || '삭제 실패')
    }
  }

  const draggerProps: UploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.size > 500 * 1024 * 1024) {
        message.error('파일 크기 500MB 초과')
        return Upload.LIST_IGNORE
      }
      return false
    },
    onChange: async (info) => {
      const file = info.fileList[0]?.originFileObj
      if (!file) return
      set업로딩(true)
      try {
        await phase1API.파일업로드(folder, file)
        message.success(`${file.name} 업로드 완료`)
        목록조회()
      } catch (err: any) {
        message.error(err.response?.data?.detail || '업로드 실패')
      } finally {
        set업로딩(false)
      }
    },
  }

  const 컬럼 = [
    {
      title: '파일명',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Button
          type="link"
          style={{ padding: 0, textAlign: 'left' }}
          onClick={() => onFileSelect(name)}
        >
          {selectedFile === name ? <Tag color="blue">{name}</Tag> : name}
        </Button>
      ),
    },
    {
      title: '크기',
      dataIndex: 'size',
      key: 'size',
      width: 90,
      render: (size: number) => `${(size / 1024).toFixed(1)}KB`,
    },
    {
      title: '수정일',
      dataIndex: 'mtime',
      key: 'mtime',
      width: 160,
      render: (v: string) => v?.slice(0, 19).replace('T', ' '),
    },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: any, record: FileItem) => (
        <Popconfirm
          title={`${record.name} 삭제하시겠습니까?`}
          onConfirm={() => 삭제핸들러(record.name)}
          okText="삭제"
          cancelText="취소"
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <Tabs
        activeKey={folder}
        onChange={onFolderChange}
        items={[
          { key: 'popular', label: '인기검색어' },
          { key: 'fails', label: '실패검색어' },
        ]}
      />

      <Dragger {...draggerProps} style={{ marginBottom: 16 }} disabled={업로딩}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">파일을 드래그하거나 클릭하여 업로드</p>
        <p className="ant-upload-hint">텍스트 형식 파일 (최대 500MB)</p>
      </Dragger>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text type="secondary">{파일목록.length}개 파일</Text>
        <Button size="small" icon={<ReloadOutlined />} onClick={목록조회} loading={로딩}>새로고침</Button>
      </div>

      <Table
        rowKey="name"
        dataSource={파일목록}
        columns={컬럼}
        size="small"
        loading={로딩}
        pagination={{ pageSize: 10, size: 'small' }}
        onRow={(record) => ({
          onClick: () => onFileSelect(record.name),
          style: { cursor: 'pointer', background: selectedFile === record.name ? '#e6f4ff' : undefined },
        })}
      />
    </div>
  )
}
