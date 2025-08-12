# ChatApp backend (PocketBase)

- Requires PocketBase running locally (or remote): `POCKETBASE_URL`
- Scripts expect admin email/password to authenticate and manage schema.

## Setup
1. Install deps:
```sh
cd backend-pb
npm install
```
2. Ensure PocketBase is running at `http://127.0.0.1:8090`.
3. Set env variables or edit scripts to match your host/creds.

## Scripts
- Initialize schema (collections, indexes):
```sh
npm run init:schema
```
- Seed sample data:
```sh
npm run seed
```
# react-native-chat-backend
