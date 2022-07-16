import axios from 'axios';
import secrets from '../secrets.json';

export const BASE_URL = secrets.apiUrl;

export default axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${secrets.ff3Token}`
  },
  mode: 'cors',
  cache: 'no-cache',
});