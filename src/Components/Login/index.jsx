import { Button, Row, Col, Typography } from 'antd';
import React from 'react';
import { GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { auth } from '../../firebase/config'; // đường dẫn đúng tới config.js
import '../../Components/Login/Login.css'; // Đảm bảo bạn đã tạo file CSS này để định dạng nút đăng nhập
import { GoogleOutlined, FacebookOutlined } from '@ant-design/icons';
import { addDocument, generateKeywords } from '../../firebase/services';

const { Title } = Typography;

const fbProvider = new FacebookAuthProvider();
const googleProvider = new GoogleAuthProvider();

export default function Login() {
  const handleLogin = async (provider) => {
    const { additionalUserInfo, user } = await auth.signInWithPopup(provider);

    if (additionalUserInfo?.isNewUser) {
      addDocument('users', {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        uid: user.uid,
        providerId: additionalUserInfo.providerId,
        keywords: generateKeywords(user.displayName?.toLowerCase()),
      });
    }
  };

    return (
        <div style={{ padding: '10%', justifyContent: 'center' }}>
            <Row justify="center" style={{ height: '400px', backgroundColor: '#588157' }}>
                <Col
                    span={8}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        paddingBottom: 40,
                    }}
                >
                    <Title style={{ textAlign: 'center', backgroundColor: '#a3b18a', color: 'white', height: '45px', borderRadius: '10px' }} level={3}>Đăng nhập</Title>
                    <Button className="social-login-button google-btn" onClick={() => handleLogin(googleProvider)}> 
                        <GoogleOutlined />
                        Login with Google
                    </Button>
                    <Button className="social-login-button facebook-btn" onClick={() => handleLogin(fbProvider)}>
                        <FacebookOutlined />
                        Login with Facebook
                    </Button>
                </Col>
            </Row>
        </div>
    );
}
