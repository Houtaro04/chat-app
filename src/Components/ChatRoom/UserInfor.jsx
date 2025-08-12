// import { Avatar, Button, Typography } from "antd";
import React, { useContext } from "react";
import { auth } from "../../firebase/config"; // Adjust the import path as necessary
import { AuthContext } from "../../Context/AuthProvider";
import { Dropdown, Menu, Avatar, Space, Typography } from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import styled from "styled-components";

const WrapperStyle = styled.div`
    display: flex;
    justify-content: flex-start;
    margin-top: auto;
    padding: 12px 16px;
    border-top: 1px solid rgba(82, 38, 83);

    .username{
        color: white;
        margin-left: 5px;
    }
`;
export default function UserInfor() {
    const handleLogout = () => {
        // Xử lý đăng xuất ở đây
        console.log("Đăng xuất");
        auth.signOut();
    }
    
    const { user: {
      displayName, 
      photoURL
    } } = useContext(AuthContext);

    const initial = displayName?.charAt(0)?.toUpperCase() || "";

    const items = [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: "Đăng xuất"
      }
    ]
    return (
    <WrapperStyle>
      <div>
        <Dropdown menu={{items, onClick: ({key}) => key === "logout" && handleLogout()}} trigger={["click"]} placement="bottomLeft">
          <Space style={{ cursor: "pointer"}}>
            <Avatar src={photoURL}>{!photoURL && initial}</Avatar>
            <Typography.Text className="username">{displayName}</Typography.Text>
          </Space>
        </Dropdown>
      </div>
    </WrapperStyle>
  );
} 