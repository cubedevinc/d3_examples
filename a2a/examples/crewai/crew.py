from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai.agents.agent_builder.base_agent import BaseAgent
from typing import List
from send_task_tool import send_task

@CrewBase
class LatestAiDevelopmentCrew():
  """LatestAiDevelopment crew"""

  agents: List[BaseAgent]
  tasks: List[Task]

  @agent
  def data_analyst(self) -> Agent:
    return Agent(
      role="Data Analyst",
      goal="Analyze the data and provide a report.",
      backstory="You are a data analyst with a passion for data.",
      verbose=True,
      tools=[send_task]
    )

  @task
  def reporting_task(self) -> Task:
    return Task(
      description="Analyze the data and provide a report.",
      expected_output="A report with the data analysis.",
      agent=self.data_analyst(),
      output_file="report.md"
    )

  @crew
  def crew(self) -> Crew:
    """Creates the LatestAiDevelopment crew"""
    return Crew(
      agents=self.agents, # Automatically created by the @agent decorator
      tasks=self.tasks, # Automatically created by the @task decorator
      process=Process.sequential,
      verbose=True,
    )