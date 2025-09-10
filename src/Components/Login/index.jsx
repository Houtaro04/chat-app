import { Button, Row, Col, Typography } from 'antd';
import React from 'react';
import { GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { auth, firebase } from '../../firebase/config'; // đường dẫn đúng tới config.js
import '../../Components/Login/Login.css'; // Đảm bảo bạn đã tạo file CSS này để định dạng nút đăng nhập
import { GoogleOutlined, FacebookOutlined } from '@ant-design/icons';
import { addDocument, generateKeywords } from '../../firebase/services';
import logo from '../../assets/logo.png'

const { Title } = Typography;

const fbProvider = new firebase.auth.FacebookAuthProvider();
const googleProvider = new firebase.auth.GoogleAuthProvider();

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
            <Row justify="center" style={{ height: '400px', backgroundColor: '#a3ab6f' }}>
                <Col
                    span={8}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        paddingBottom: 40,
                    }}
                >
                    <img src={logo} style={{ width: '200px', height: '50px', borderRadius: '10px', display: 'flex', marginLeft: 'auto', marginRight: 'auto'}} level={3}></img>
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
