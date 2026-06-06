import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { getModelToken } from '@nestjs/mongoose';
import { Project } from './schemas/project.schema';
import { NotFoundException } from '@nestjs/common';

const mockProject = {
  _id: '507f1f77bcf86cd799439011',
  name: 'Test Project',
  user: '507f1f77bcf86cd799439022',
};

const mockProjectModel = {
  find: jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue([mockProject]) }),
  findById: jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(mockProject) }),
  findByIdAndDelete: jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(mockProject) }),
  constructor: jest.fn(),
};

// Mock the model constructor for create
function MockModel(dto) {
  Object.assign(this, dto);
  this.save = jest.fn().mockResolvedValue({ ...dto, _id: 'new-id' });
}
MockModel.find = mockProjectModel.find;
MockModel.findById = mockProjectModel.findById;
MockModel.findByIdAndDelete = mockProjectModel.findByIdAndDelete;

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getModelToken(Project.name), useValue: MockModel },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a project', async () => {
      const result = await service.create({
        name: 'New Project',
        user: 'user-id',
      });

      expect(result).toHaveProperty('_id');
    });
  });

  describe('findOne', () => {
    it('should return a project', async () => {
      MockModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProject),
      });

      const result = await service.findOne(mockProject._id);
      expect(result).toEqual(mockProject);
    });

    it('should throw NotFoundException if not found', async () => {
      MockModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should delete a project', async () => {
      MockModel.findByIdAndDelete = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProject),
      });

      const result = await service.delete(mockProject._id);
      expect(result).toEqual(mockProject);
    });

    it('should throw NotFoundException if not found', async () => {
      MockModel.findByIdAndDelete = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.delete('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByUser', () => {
    it('should return user projects', async () => {
      MockModel.find = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockProject]),
      });

      const result = await service.findByUser('user-id');
      expect(result).toEqual([mockProject]);
    });
  });
});
