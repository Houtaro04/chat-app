// src/Components/Login/Login.jsx
import React, { useState } from 'react';
import { Row, Col, Typography, Button, Modal, Form, Input, message, Divider } from 'antd';
import { GoogleOutlined, FacebookOutlined, UserOutlined, LockOutlined, MailOutlined, PlusOutlined, LoginOutlined } from '@ant-design/icons';
import { auth, firebase } from '../../firebase/config';
import { addDocument, generateKeywords } from '../../firebase/services';
import axios from 'axios';

import '../../Components/Login/Login.css';
import logo from '../../assets/logo.png';

const { Title, Text } = Typography;

const fbProvider = new firebase.auth.FacebookAuthProvider();
const googleProvider = new firebase.auth.GoogleAuthProvider();

const API_BASE = import.meta.env?.VITE_API_BASE || 'http://localhost:8000';

export default function Login() {
  // Modal JWT Login
  const [jwtOpen, setJwtOpen] = useState(false);
  const [jwtLoading, setJwtLoading] = useState(false);
  const [loginForm] = Form.useForm();

  // Modal Register
  const [regOpen, setRegOpen] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regForm] = Form.useForm();

  // ------------------ SOCIAL (Firebase) ------------------
  const handleLoginSocial = async (provider) => {
    try {
      const { additionalUserInfo, user } = await auth.signInWithPopup(provider);

      if (additionalUserInfo?.isNewUser) {
        await addDocument('users', {
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          uid: user.uid,
          providerId: additionalUserInfo.providerId,
          keywords: generateKeywords(user.displayName?.toLowerCase() || ''),
        });
      }
      message.success('Đăng nhập thành công!');
    } catch (err) {
      console.error(err);
      message.error(err?.message || 'Đăng nhập thất bại');
    }
  };

  // ------------------ JWT helpers ------------------
  const saveAuth = (user, token) => {
    localStorage.setItem('jwt_auth', JSON.stringify({ user, token, loginAt: Date.now() }));
  };

  const syncUserToFirestore = async (user) => {
    if (!user) return;
    try {
      await addDocument('users', {
        displayName: user.username || user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        uid: user._id || user.id || user.username,
        providerId: 'jwt',
        keywords: generateKeywords(String(user.username || user.displayName || '').toLowerCase()),
      });
    } catch (e) {
      // Không critical: chỉ log
      console.warn('syncUserToFirestore error:', e?.message);
    }
  };

  const loginWithJwt = async ({ username, password }) => {
    const basic = btoa(`${username}:${password}`);
    const res = await axios.post(
      `${API_BASE}/v1/auth/login`,
      { username },
      { headers: { Authorization: `Basic ${basic}` }, withCredentials: true }
    );
    const { user, token } = res.data || {};
    if (!token) throw new Error('Không nhận được token từ máy chủ');
    saveAuth(user, token);
    await syncUserToFirestore(user);
  };

  // ------------------ JWT LOGIN ------------------
  const handleJwtLogin = async (values) => {
    const { username, password } = values || {};
    if (!username || !password) return;

    setJwtLoading(true);
    try {
      await loginWithJwt({ username, password });
      message.success('Đăng nhập JWT thành công!');
      setJwtOpen(false);
      loginForm.resetFields();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || err?.message || 'Đăng nhập JWT thất bại';
      message.error(msg);
    } finally {
      setJwtLoading(false);
    }
  };

  // ------------------ REGISTER ------------------
  const handleRegister = async (values) => {
    const { username, email, password } = values || {};
    setRegLoading(true);
    try {
      // 1) Đăng ký
      await axios.post(`${API_BASE}/v1/auth/register`, { username, email, password }, { withCredentials: true });
      message.success('Tạo tài khoản thành công! Đang đăng nhập…');

      // 2) Tự động đăng nhập
      await loginWithJwt({ username, password });

      setRegOpen(false);
      regForm.resetFields();
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        (err?.response?.status === 409 ? 'Username đã tồn tại' : '') ||
        err?.message ||
        'Tạo tài khoản thất bại';
      message.error(msg);
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div style={{ padding: '10%', justifyContent: 'center' }}>
      <Row justify="center" style={{ minHeight: 420, backgroundColor: '#a3ab6f' }}>
        <Col
          span={8}
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingBottom: 40,
            gap: 12,
          }}
        >
          <img
            src={logo}
            alt="logo"
            style={{
              width: 200,
              height: 50,
              borderRadius: 10,
              display: 'flex',
              marginLeft: 'auto',
              marginRight: 'auto',
              objectFit: 'contain',
            }}
          />

          {/* Social login */}
          <Button
            className="social-login-button google-btn"
            onClick={() => handleLoginSocial(googleProvider)}
            icon={<GoogleOutlined />}
          >
            Login with Google
          </Button>
          <Button
            className="social-login-button facebook-btn"
            onClick={() => handleLoginSocial(fbProvider)}
            icon={<FacebookOutlined />}
          >
            Login with Facebook
          </Button>

          <Divider plain style={{ margin: '12px 0' }}>
            hoặc
          </Divider>

          {/* JWT login button */}
           <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                }}
           >
            <Button
                type="primary"
                className="social-login-button"
                onClick={() => setJwtOpen(true)}
                icon={<LoginOutlined />}
            >
                Login with Username
            </Button>
           </div> 
          {/* Register button */}
          <Button
            type="dashed"
            className="social-login-button"
            onClick={() => setRegOpen(true)}
            icon={<PlusOutlined />}
            style={{color: 'white', backgroundColor: 'green'}}
          >
            Create new account
          </Button>
        </Col>
      </Row>

      {/* --------- Modal: JWT Login --------- */}
      <Modal
        title="Login with Username"
        open={jwtOpen}
        onCancel={() => {
          setJwtOpen(false);
          loginForm.resetFields();
        }}
        okText="Login"
        onOk={() => loginForm.submit()}
        confirmLoading={jwtLoading}
        destroyOnClose
      >
        <Form form={loginForm} layout="vertical" onFinish={handleJwtLogin}>
          <Form.Item
            name="username"
            label="Username"
            rules={[
              { required: true, message: 'Nhập username' },
              { min: 3, message: 'Tối thiểu 3 ký tự' },
            ]}
          >
            <Input placeholder="nhap_username" allowClear prefix={<UserOutlined />} />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Nhập password' },
              { min: 6, message: 'Tối thiểu 6 ký tự' },
            ]}
          >
            <Input.Password placeholder="••••••••" prefix={<LockOutlined />} />
          </Form.Item>

          {/* Ẩn nút submit thực để Enter hoạt động */}
          <Form.Item style={{ display: 'none' }}>
            <button type="submit" />
          </Form.Item>
        </Form>
      </Modal>

      {/* --------- Modal: Register --------- */}
      <Modal
        title="Create account"
        open={regOpen}
        onCancel={() => {
          setRegOpen(false);
          regForm.resetFields();
        }}
        okText="Sign up"
        onOk={() => regForm.submit()}
        confirmLoading={regLoading}
        destroyOnClose
      >
        <Form
          form={regForm}
          layout="vertical"
          onFinish={handleRegister}
          initialValues={{ username: '', email: '', password: '', confirm: '' }}
        >
          <Form.Item
            name="username"
            label="Username"
            rules={[
              { required: true, message: 'Nhập username' },
              { min: 3, message: 'Tối thiểu 3 ký tự' },
              { pattern: /^[a-zA-Z0-9_\.]+$/, message: 'Chỉ chữ, số, dấu . hoặc _' },
            ]}
          >
            <Input placeholder="username" allowClear prefix={<UserOutlined />} />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email (tuỳ chọn)"
            rules={[
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input placeholder="you@example.com" allowClear prefix={<MailOutlined />} />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Nhập password' },
              { min: 6, message: 'Tối thiểu 6 ký tự' },
            ]}
          >
            <Input.Password placeholder="••••••••" prefix={<LockOutlined />} />
          </Form.Item>

          <Form.Item
            name="confirm"
            label="Confirm password"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Nhập lại password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('Mật khẩu nhập lại không khớp'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="••••••••" prefix={<LockOutlined />} />
          </Form.Item>

          <Form.Item style={{ display: 'none' }}>
            <button type="submit" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
