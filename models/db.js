const express = require("express");
const mysql = require("mysql2");

//데이터베이스 연결
const connection = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Yongin@0322",
  database: "aiservicelab",
});

//연결 오류시 에러메시지 출력
connection.connect((err) => {
  if (err) {
    console.error("데이터 베이스와 연결에 실패했습니다." + err.stack);
    return;
  }
  console.log("데이터 베이스 연결 완료");
});

module.exports = connection;
