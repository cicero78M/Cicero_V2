import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import routes from './src/routes/index.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import './src/service/waService.js';
import './src/service/cronService.js'


dotenv.config();
const app = express();

app.use(express.json());
app.use(morgan('dev'));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
