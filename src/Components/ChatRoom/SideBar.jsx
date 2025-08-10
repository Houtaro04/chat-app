import React from "react"
import { Row, Col } from 'antd';
import UserInfor from "./UserInfor";
import RoomList from "./RoomList";
import styled from "styled-components";

const SidebarStyle = styled.div`
    background-color: #355e3b;
    color: white;
    height: 100vh;  
`;
export default function Sidebar() {
    return (
        <SidebarStyle>
            <Row>
                <Col span={24}><UserInfor /></Col>
                <Col span={24}><RoomList /></Col>
            </Row>
        </SidebarStyle>
    );
}