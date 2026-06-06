import { Test, TestingModule } from '@nestjs/testing';
import { AssistantController } from './assistant.controller';
import { ToolDispatchService } from './tool-dispatch.service';

const mockToolDispatchService = {
  handleChat: jest.fn(),
};

describe('AssistantController', () => {
  let controller: AssistantController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssistantController],
      providers: [
        { provide: ToolDispatchService, useValue: mockToolDispatchService },
      ],
    }).compile();

    controller = module.get<AssistantController>(AssistantController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('chat', () => {
    it('should call toolDispatchService.handleChat with correct params', async () => {
      mockToolDispatchService.handleChat.mockResolvedValue({
        message: 'Done!',
        responseId: 'resp_1',
        deployments: [],
      });

      const result = await controller.chat(
        {
          message: 'Hello',
          projectId: undefined,
          previousResponseId: undefined,
        },
        'user-id',
      );

      expect(mockToolDispatchService.handleChat).toHaveBeenCalledWith(
        'Hello',
        'user-id',
        undefined,
        undefined,
      );
      expect(result.message).toBe('Done!');
    });

    it('should pass projectId and previousResponseId when provided', async () => {
      mockToolDispatchService.handleChat.mockResolvedValue({
        message: 'Continued!',
        responseId: 'resp_2',
        deployments: [],
      });

      await controller.chat(
        {
          message: 'Continue',
          projectId: 'proj-123',
          previousResponseId: 'resp_prev',
        },
        'user-id',
      );

      expect(mockToolDispatchService.handleChat).toHaveBeenCalledWith(
        'Continue',
        'user-id',
        'proj-123',
        'resp_prev',
      );
    });
  });
});
