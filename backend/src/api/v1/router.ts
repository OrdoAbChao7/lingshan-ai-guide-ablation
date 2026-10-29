import { Router } from 'express';
import { verifyToken } from './auth';

const apiRouter = Router();

// Mount sub-routers
import { visitorRouter } from './visitor';
import { adminRouter } from './admin';
import { authRouter } from './auth';
import { agentArtsRouter, createAgentArtsRouter } from './agentarts';
import { safetyRouter } from './safety';

apiRouter.use('/auth', authRouter);
apiRouter.use('/agentarts', agentArtsRouter);
apiRouter.use('/admin/agentarts', verifyToken, createAgentArtsRouter({ trustedAdmin: true }));
apiRouter.use('/safety', safetyRouter);
apiRouter.use('/visitor', visitorRouter);
apiRouter.use('/admin', verifyToken, adminRouter);

export { apiRouter };
