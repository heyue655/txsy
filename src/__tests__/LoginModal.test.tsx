import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginModal from '../LoginModal'

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// 组件中 Tab 和按钮文本使用全角空格，用 role 查询更稳定
// 登录按钮：role=button，name 匹配 /登/
// 注册 Tab：role 不是 button (是 div)，用 getByText + exact:false 或 regex

describe('LoginModal', () => {
  const mockOnSuccess = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('渲染', () => {
    it('默认展示登录 Tab', () => {
      render(<LoginModal onSuccess={mockOnSuccess} />)
      expect(screen.getByPlaceholderText('用户名')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('密码（不少于6位）')).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('昵称（可选）')).not.toBeInTheDocument()
    })

    it('切换到注册 Tab 后出现昵称输入框', async () => {
      render(<LoginModal onSuccess={mockOnSuccess} />)
      // 全角空格，用 regex 匹配
      await userEvent.click(screen.getByText(/注\s*册/))
      expect(screen.getByPlaceholderText('昵称（可选）')).toBeInTheDocument()
    })

    it('isLimitReached=true 时显示访客限制提示', () => {
      render(<LoginModal onSuccess={mockOnSuccess} isLimitReached />)
      expect(screen.getByText(/访客畅言次数已达上限/)).toBeInTheDocument()
    })

    it('传入 onClose 时显示关闭按钮', () => {
      render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />)
      expect(screen.getByText('✕')).toBeInTheDocument()
    })

    it('不传 onClose 时不显示关闭按钮', () => {
      render(<LoginModal onSuccess={mockOnSuccess} />)
      expect(screen.queryByText('✕')).not.toBeInTheDocument()
    })
  })

  describe('表单验证', () => {
    it('空用户名时显示错误提示', async () => {
      render(<LoginModal onSuccess={mockOnSuccess} />)
      // 点击提交按钮（button 元素，文本含"登"）
      await userEvent.click(screen.getByRole('button', { name: /登/ }))
      expect(screen.getByText('请填写用户名和密码')).toBeInTheDocument()
    })

    it('空密码时显示错误提示', async () => {
      render(<LoginModal onSuccess={mockOnSuccess} />)
      await userEvent.type(screen.getByPlaceholderText('用户名'), 'testuser')
      await userEvent.click(screen.getByRole('button', { name: /登/ }))
      expect(screen.getByText('请填写用户名和密码')).toBeInTheDocument()
    })
  })

  describe('登录流程', () => {
    it('登录成功调用 onSuccess 并传入用户信息', async () => {
      const mockUser = { id: 1, username: 'testuser', nickname: '学子' }
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ code: 0, data: { user: mockUser, token: 'jwt-token-123' } }),
      })

      render(<LoginModal onSuccess={mockOnSuccess} />)
      await userEvent.type(screen.getByPlaceholderText('用户名'), 'testuser')
      await userEvent.type(screen.getByPlaceholderText('密码（不少于6位）'), 'pass123')
      await userEvent.click(screen.getByRole('button', { name: /登/ }))

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith(mockUser, 'jwt-token-123')
      })
    })

    it('登录失败显示服务器返回的错误信息', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ code: 1, message: '用户名或密码错误' }),
      })

      render(<LoginModal onSuccess={mockOnSuccess} />)
      await userEvent.type(screen.getByPlaceholderText('用户名'), 'testuser')
      await userEvent.type(screen.getByPlaceholderText('密码（不少于6位）'), 'wrongpass')
      await userEvent.click(screen.getByRole('button', { name: /登/ }))

      await waitFor(() => {
        expect(screen.getByText('用户名或密码错误')).toBeInTheDocument()
      })
      expect(mockOnSuccess).not.toHaveBeenCalled()
    })

    it('网络异常时显示"网络错误"提示', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network Error'))

      render(<LoginModal onSuccess={mockOnSuccess} />)
      await userEvent.type(screen.getByPlaceholderText('用户名'), 'testuser')
      await userEvent.type(screen.getByPlaceholderText('密码（不少于6位）'), 'pass123')
      await userEvent.click(screen.getByRole('button', { name: /登/ }))

      await waitFor(() => {
        expect(screen.getByText('网络错误，请重试')).toBeInTheDocument()
      })
    })

    it('登录请求发送到正确的 API 端点', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ code: 0, data: { user: { id: 1, username: 'u', nickname: null }, token: 't' } }),
      })

      render(<LoginModal onSuccess={mockOnSuccess} />)
      await userEvent.type(screen.getByPlaceholderText('用户名'), 'testuser')
      await userEvent.type(screen.getByPlaceholderText('密码（不少于6位）'), 'pass123')
      await userEvent.click(screen.getByRole('button', { name: /登/ }))

      await waitFor(() => expect(mockFetch).toHaveBeenCalled())
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('/api/h5/auth/login')
      expect(JSON.parse(options.body)).toMatchObject({ username: 'testuser', password: 'pass123' })
    })
  })

  describe('注册流程', () => {
    it('注册请求发送到正确端点并包含 nickname', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ code: 0, data: { user: { id: 2, username: 'newuser', nickname: '新学子' }, token: 'tok' } }),
      })

      render(<LoginModal onSuccess={mockOnSuccess} />)
      // 先切换到注册 Tab
      await userEvent.click(screen.getByText(/注\s*册/))
      await userEvent.type(screen.getByPlaceholderText('用户名'), 'newuser')
      await userEvent.type(screen.getByPlaceholderText('密码（不少于6位）'), 'pass123')
      await userEvent.type(screen.getByPlaceholderText('昵称（可选）'), '新学子')
      // 点击注册按钮（现在 button 文本是"注册"）
      await userEvent.click(screen.getByRole('button', { name: /注/ }))

      await waitFor(() => expect(mockFetch).toHaveBeenCalled())
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('/api/h5/auth/register')
      expect(JSON.parse(options.body)).toMatchObject({ username: 'newuser', password: 'pass123', nickname: '新学子' })
    })

    it('注册时携带 localStorage 中的邀请码', async () => {
      localStorage.setItem('txbt_invite', 'INVITE01')
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ code: 0, data: { user: { id: 3, username: 'u3', nickname: null }, token: 't3' } }),
      })

      render(<LoginModal onSuccess={mockOnSuccess} />)
      await userEvent.click(screen.getByText(/注\s*册/))
      await userEvent.type(screen.getByPlaceholderText('用户名'), 'u3')
      await userEvent.type(screen.getByPlaceholderText('密码（不少于6位）'), 'pass123')
      await userEvent.click(screen.getByRole('button', { name: /注/ }))

      await waitFor(() => expect(mockFetch).toHaveBeenCalled())
      const [, options] = mockFetch.mock.calls[0]
      expect(JSON.parse(options.body)).toMatchObject({ inviterCode: 'INVITE01' })
    })

    it('注册成功后清除 localStorage 邀请码', async () => {
      localStorage.setItem('txbt_invite', 'INVITE01')
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ code: 0, data: { user: { id: 3, username: 'u3', nickname: null }, token: 't3' } }),
      })

      render(<LoginModal onSuccess={mockOnSuccess} />)
      await userEvent.click(screen.getByText(/注\s*册/))
      await userEvent.type(screen.getByPlaceholderText('用户名'), 'u3')
      await userEvent.type(screen.getByPlaceholderText('密码（不少于6位）'), 'pass123')
      await userEvent.click(screen.getByRole('button', { name: /注/ }))

      await waitFor(() => expect(mockOnSuccess).toHaveBeenCalled())
      expect(localStorage.getItem('txbt_invite')).toBeNull()
    })
  })

  describe('关闭行为', () => {
    it('点击关闭按钮触发 onClose', async () => {
      render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />)
      await userEvent.click(screen.getByText('✕'))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('点击遮罩层（非内容区域）触发 onClose', () => {
      const { container } = render(<LoginModal onSuccess={mockOnSuccess} onClose={mockOnClose} />)
      // 最外层遮罩 div
      const overlay = container.firstChild as HTMLElement
      fireEvent.click(overlay, { target: overlay })
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })
})
